const PRIMARY_KEYWORDS = ['blackmagic', 'atem'];
const SECONDARY_KEYWORDS = ['decklink', 'ultrastudio', 'intensity'];
const GENERIC_CAPTURE_KEYWORDS = [
  'capture',
  'hdmi',
  'usb video',
  'uvc',
  'avermedia',
  'elgato',
  'feelworld',
  'livepro',
];

export const ATEM_USB_DEVICE_LABEL_STORAGE_KEY =
  'unoworship-atem-usb-relay-v2-device-label';

export function normalizeDeviceLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

function includesKeyword(label: string, keywords: string[]): boolean {
  const normalized = normalizeDeviceLabel(label);
  return keywords.some((keyword) => normalized.includes(keyword));
}

export function isSupportedCaptureLabel(label: string): boolean {
  return (
    includesKeyword(label, PRIMARY_KEYWORDS) ||
    includesKeyword(label, SECONDARY_KEYWORDS) ||
    includesKeyword(label, GENERIC_CAPTURE_KEYWORDS)
  );
}

function rankDevice(device: MediaDeviceInfo): number {
  if (includesKeyword(device.label, PRIMARY_KEYWORDS)) return 0;
  if (includesKeyword(device.label, SECONDARY_KEYWORDS)) return 1;
  if (includesKeyword(device.label, GENERIC_CAPTURE_KEYWORDS)) return 2;
  return 99;
}

export function chooseAtemUsbDevice(
  devices: MediaDeviceInfo[],
  preferredLabel: string | null,
): MediaDeviceInfo | null {
  const videoDevices = devices.filter(
    (device) => device.kind === 'videoinput' && device.label,
  );

  if (preferredLabel) {
    const normalizedPreferred = normalizeDeviceLabel(preferredLabel);
    const exact = videoDevices.find(
      (device) => normalizeDeviceLabel(device.label) === normalizedPreferred,
    );
    if (exact) return exact;

    const compatible = videoDevices.find((device) => {
      const normalized = normalizeDeviceLabel(device.label);
      return (
        normalized.includes(normalizedPreferred) ||
        normalizedPreferred.includes(normalized)
      );
    });
    return compatible ?? null;
  }

  return (
    [...videoDevices]
      .filter((device) => isSupportedCaptureLabel(device.label))
      .sort((a, b) => rankDevice(a) - rankDevice(b))[0] ?? null
  );
}
