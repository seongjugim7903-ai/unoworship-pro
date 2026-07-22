'use client';

import { useEffect, useRef, useState } from 'react';
import { getSocket } from '@/lib/socketClient';
import {
  SOCKET_EVENTS,
  SOCKET_ROOMS,
  type WebRTCSignal,
} from '@/lib/socketEvents';
import type { AtemUsbPublisherDiagnostics } from './types';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};
const STATS_INTERVAL_MS = 4_000;
const STALL_CHECK_LIMIT = 3;
const MAX_FRAME_RATE = 30;
const MAX_BITRATE = 8_000_000;

const EMPTY_DIAGNOSTICS: AtemUsbPublisherDiagnostics = {
  viewerCount: 0,
  connectedViewerCount: 0,
  framesEncoded: 0,
  bytesSent: 0,
  lastFrameProgressAt: null,
  stalledChecks: 0,
};

type OutboundSample = {
  framesEncoded: number;
  bytesSent: number;
};

async function readOutboundSample(
  peer: RTCPeerConnection,
): Promise<OutboundSample | null> {
  const sender = peer.getSenders().find((candidate) => candidate.track?.kind === 'video');
  if (!sender) return null;
  const reports = await sender.getStats();
  let sample: OutboundSample | null = null;
  reports.forEach((report) => {
    if (report.type !== 'outbound-rtp' || report.kind !== 'video') return;
    sample = {
      framesEncoded: Number(report.framesEncoded ?? 0),
      bytesSent: Number(report.bytesSent ?? 0),
    };
  });
  return sample;
}

export function useDirectCamerasPublisher(
  stream: MediaStream | null,
  onStall: (reason: string) => void,
): AtemUsbPublisherDiagnostics {
  const [diagnostics, setDiagnostics] =
    useState<AtemUsbPublisherDiagnostics>(EMPTY_DIAGNOSTICS);
  const onStallRef = useRef(onStall);

  useEffect(() => {
    onStallRef.current = onStall;
  }, [onStall]);

  useEffect(() => {
    if (!stream) return;

    const socket = getSocket();
    const videoTrack = stream.getVideoTracks()[0];
    if (!socket || !videoTrack) return;

    let disposed = false;
    let stalledChecks = 0;
    let lastFrameProgressAt: number | null = null;
    const peers = new Map<string, RTCPeerConnection>();
    const previousSamples = new Map<string, OutboundSample>();

    const publishDiagnostics = (
      framesEncoded: number,
      bytesSent: number,
      connectedViewerCount: number,
    ) => {
      if (disposed) return;
      setDiagnostics({
        viewerCount: peers.size,
        connectedViewerCount,
        framesEncoded,
        bytesSent,
        lastFrameProgressAt,
        stalledChecks,
      });
    };

    const announceReady = () => {
      socket.emit(SOCKET_EVENTS.JOIN_ROOM, SOCKET_ROOMS.CAMERAS_SOURCE);
      socket.emit(SOCKET_EVENTS.CAMERAS_READY);
    };

    const closePeer = (viewerId: string, requestReconnect = false) => {
      const peer = peers.get(viewerId);
      if (peer) {
        try {
          peer.close();
        } catch {
          // 이미 닫힌 연결이다.
        }
      }
      peers.delete(viewerId);
      previousSamples.delete(viewerId);
      if (requestReconnect && !disposed) {
        window.setTimeout(announceReady, 500);
      }
    };

    const createPeer = async (viewerId: string) => {
      closePeer(viewerId);
      const peer = new RTCPeerConnection(RTC_CONFIG);
      peers.set(viewerId, peer);

      const sender = peer.addTrack(videoTrack, stream);
      try {
        const parameters = sender.getParameters();
        if (parameters.encodings.length > 0) {
          parameters.encodings[0].maxFramerate = MAX_FRAME_RATE;
          parameters.encodings[0].maxBitrate = MAX_BITRATE;
          await sender.setParameters(parameters);
        }
      } catch {
        // 장치/Chrome 버전에 따라 setParameters가 거부돼도 기본 송출은 유지한다.
      }

      peer.onicecandidate = (event) => {
        if (!event.candidate) return;
        socket.emit(SOCKET_EVENTS.CAMERAS_WEBRTC_SIGNAL, {
          kind: 'ice',
          to: viewerId,
          candidate: event.candidate.toJSON(),
        } satisfies WebRTCSignal);
      };

      peer.onconnectionstatechange = () => {
        const state = peer.connectionState;
        if (state === 'failed' || state === 'closed' || state === 'disconnected') {
          closePeer(viewerId, state !== 'closed');
        }
      };

      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit(SOCKET_EVENTS.CAMERAS_WEBRTC_SIGNAL, {
          kind: 'offer',
          to: viewerId,
          sdp: offer,
        } satisfies WebRTCSignal);
      } catch (caught) {
        console.warn('[atemUsbRelayV2] WebRTC offer 실패:', caught);
        closePeer(viewerId, true);
      }
    };

    const handleViewerJoin = (data: { viewerSocketId?: string }) => {
      if (!data?.viewerSocketId) return;
      void createPeer(data.viewerSocketId);
    };

    const handleViewerLeave = (data: { viewerSocketId?: string }) => {
      if (!data?.viewerSocketId) return;
      closePeer(data.viewerSocketId);
    };

    const handleSignal = async (signal: WebRTCSignal & { from: string }) => {
      if (!signal?.from) return;
      const peer = peers.get(signal.from);
      if (!peer) return;
      try {
        if (signal.kind === 'answer') {
          await peer.setRemoteDescription(signal.sdp);
        } else if (signal.kind === 'ice') {
          await peer.addIceCandidate(signal.candidate);
        }
      } catch (caught) {
        console.warn('[atemUsbRelayV2] WebRTC signal 처리 실패:', caught);
      }
    };

    const pollStats = async () => {
      let framesEncoded = 0;
      let bytesSent = 0;
      let connectedViewerCount = 0;
      let sampledConnectedViewerCount = 0;
      let anyProgress = false;

      await Promise.all(
        [...peers.entries()].map(async ([viewerId, peer]) => {
          if (peer.connectionState !== 'connected') return;
          connectedViewerCount += 1;
          try {
            const sample = await readOutboundSample(peer);
            if (!sample) return;
            sampledConnectedViewerCount += 1;
            framesEncoded += sample.framesEncoded;
            bytesSent += sample.bytesSent;
            const previous = previousSamples.get(viewerId);
            if (
              !previous ||
              sample.framesEncoded > previous.framesEncoded ||
              sample.bytesSent > previous.bytesSent
            ) {
              anyProgress = true;
            }
            previousSamples.set(viewerId, sample);
          } catch {
            // 일시적인 getStats 실패는 다음 주기에 다시 확인한다.
          }
        }),
      );

      if (anyProgress) {
        stalledChecks = 0;
        lastFrameProgressAt = Date.now();
      } else if (
        connectedViewerCount > 0 &&
        sampledConnectedViewerCount > 0 &&
        videoTrack.readyState === 'live' &&
        !videoTrack.muted
      ) {
        stalledChecks += 1;
      } else {
        stalledChecks = 0;
      }

      publishDiagnostics(framesEncoded, bytesSent, connectedViewerCount);

      if (stalledChecks >= STALL_CHECK_LIMIT) {
        stalledChecks = 0;
        onStallRef.current('webrtc-outbound-frames-stalled');
      }
    };

    socket.on('connect', announceReady);
    socket.on(SOCKET_EVENTS.CAMERAS_VIEWER_JOIN, handleViewerJoin);
    socket.on(SOCKET_EVENTS.CAMERAS_VIEWER_LEAVE, handleViewerLeave);
    socket.on(SOCKET_EVENTS.CAMERAS_WEBRTC_SIGNAL, handleSignal);
    announceReady();

    const statsTimer = window.setInterval(() => {
      void pollStats();
    }, STATS_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(statsTimer);
      socket.off('connect', announceReady);
      socket.off(SOCKET_EVENTS.CAMERAS_VIEWER_JOIN, handleViewerJoin);
      socket.off(SOCKET_EVENTS.CAMERAS_VIEWER_LEAVE, handleViewerLeave);
      socket.off(SOCKET_EVENTS.CAMERAS_WEBRTC_SIGNAL, handleSignal);
      peers.forEach((peer) => {
        try {
          peer.close();
        } catch {
          // 이미 닫힌 연결이다.
        }
      });
      peers.clear();
      previousSamples.clear();
    };
  }, [stream]);

  return stream ? diagnostics : EMPTY_DIAGNOSTICS;
}
