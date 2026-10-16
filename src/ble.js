// BLE scan adapter for Safari + beacio (navigator.bluetooth.requestLEScan).
import { drivers } from './scales/index.js';

let scan = null;
let listener = null;

const bytes = (v) => new Uint8Array(v.buffer, v.byteOffset, v.byteLength);

// Normalize an advertisementreceived event to { id, name, manufacturerData, serviceData }.
export function normalize(event) {
  const manufacturerData = new Map();
  // Company ID 0x0000 is valid (CK829); keys are never filtered by truthiness.
  event.manufacturerData?.forEach((v, k) => manufacturerData.set(Number(k), bytes(v)));
  const serviceData = new Map();
  event.serviceData?.forEach((v, k) => serviceData.set(String(k).toLowerCase(), bytes(v)));
  return { id: event.device?.id ?? null, name: event.name ?? event.device?.name ?? null, manufacturerData, serviceData };
}

export const scanAvailable = () => typeof navigator !== 'undefined' && !!navigator.bluetooth?.requestLEScan;

// Call directly from a tap handler: requestLEScan runs synchronously, before any await,
// so iOS keeps the user activation.
export function startScan(onAdvertisement) {
  stopScan();
  // Filter to known scales: acceptAllAdvertisements makes beacio relay every nearby device,
  // which backs up its delivery queue and shows the weight seconds late.
  const filters = drivers.flatMap((d) => d.filters);
  const request = navigator.bluetooth.requestLEScan({ filters, keepRepeatedDevices: true });
  const mine = (e) => onAdvertisement(normalize(e));
  listener = mine;
  navigator.bluetooth.addEventListener('advertisementreceived', mine);
  // A scan stopped or replaced before it resolved is stopped as soon as it arrives.
  return request.then(
    (s) => { if (listener === mine) scan = s; else s.stop?.(); },
    (err) => { if (listener === mine) stopScan(); throw err; },
  );
}

export function stopScan() {
  if (listener) navigator.bluetooth.removeEventListener('advertisementreceived', listener);
  listener = null;
  try { scan?.stop?.(); } catch {}
  scan = null;
}
