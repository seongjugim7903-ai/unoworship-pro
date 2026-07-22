import { SubtitleStyle } from './types';
import { CanvasElement } from './canvasTypes';

export type BroadcastMessage =
  | { type: 'SUBTITLE_UPDATE'; payload: { text: string; style: SubtitleStyle } }
  | { type: 'ELEMENTS_UPDATE'; payload: { elements: CanvasElement[]; sectionText: string } }
  | { type: 'BLACKOUT'; payload: { active: boolean } }
  | { type: 'CLEAR_TEXT' }
  | { type: 'CAMERA_SOURCE'; payload: { deviceId: string } }
  | { type: 'PING' }
  | { type: 'PONG' };

const CHANNEL_NAME = 'unoLive-v1';

export function createBroadcastSender() {
  const channel = new BroadcastChannel(CHANNEL_NAME);

  return {
    send(message: BroadcastMessage) {
      channel.postMessage(message);
    },
    close() {
      channel.close();
    },
  };
}

export function createBroadcastReceiver(
  onMessage: (message: BroadcastMessage) => void
) {
  const channel = new BroadcastChannel(CHANNEL_NAME);

  channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
    onMessage(event.data);
  };

  return {
    send(message: BroadcastMessage) {
      channel.postMessage(message);
    },
    close() {
      channel.close();
    },
  };
}
