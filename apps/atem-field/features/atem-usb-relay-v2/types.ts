export type AtemUsbCaptureStatus =
  | 'checking-permission'
  | 'waiting-device'
  | 'connecting'
  | 'live'
  | 'recovering'
  | 'permission-blocked'
  | 'unsupported'
  | 'error';

export interface AtemUsbCaptureDiagnostics {
  status: AtemUsbCaptureStatus;
  selectedDeviceLabel: string | null;
  selectedDeviceId: string | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  trackState: MediaStreamTrackState | 'none';
  muted: boolean;
  acquireAttempts: number;
  recoveries: number;
  lastRecoveryReason: string | null;
  lastAcquiredAt: number | null;
}

export interface AtemUsbPublisherDiagnostics {
  viewerCount: number;
  connectedViewerCount: number;
  framesEncoded: number;
  bytesSent: number;
  lastFrameProgressAt: number | null;
  stalledChecks: number;
}

export interface AtemUsbDeviceOption {
  deviceId: string;
  label: string;
}
