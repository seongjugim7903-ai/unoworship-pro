'use client';

import { useEffect, useRef, useCallback } from 'react';
import { BroadcastMessage, createBroadcastSender } from '@/lib/broadcast';
import { useStore } from '@/lib/store';

export function useBroadcastSender() {
  const senderRef = useRef<ReturnType<typeof createBroadcastSender> | null>(null);
  const setOutputConnected = useStore((s) => s.setOutputConnected);

  useEffect(() => {
    const sender = createBroadcastSender();
    senderRef.current = sender;

    // Listen for PONG from Output window
    const listenChannel = new BroadcastChannel('unoLive-v1');
    listenChannel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
      if (event.data.type === 'PONG') {
        setOutputConnected(true);
      }
    };

    // Periodic PING to check Output window
    const pingInterval = setInterval(() => {
      sender.send({ type: 'PING' });
    }, 3000);

    // Timeout: if no PONG received within 5s, mark disconnected
    const checkInterval = setInterval(() => {
      // We'll set disconnected, and PONG handler will set connected
      setOutputConnected(false);
      sender.send({ type: 'PING' });
    }, 8000);

    // Initial ping
    sender.send({ type: 'PING' });

    return () => {
      clearInterval(pingInterval);
      clearInterval(checkInterval);
      listenChannel.close();
      sender.close();
    };
  }, [setOutputConnected]);

  const send = useCallback((msg: BroadcastMessage) => {
    senderRef.current?.send(msg);
  }, []);

  return { send };
}
