import type { Position } from '@/types/ftth';

export const isSamePosition = (a: Position, b: Position, epsilon: number = 0.000001): boolean => {
  return Math.abs(a.lat - b.lat) <= epsilon && Math.abs(a.lng - b.lng) <= epsilon;
};

export const buildAnchoredPath = (waypoints: Position[], start?: Position, end?: Position): Position[] => {
  const next = [...waypoints];
  if (start) {
    if (next.length === 0 || !isSamePosition(next[0]!, start)) {
      next.unshift(start);
    } else {
      next[0] = start;
    }
  }
  if (end) {
    if (next.length === 0 || !isSamePosition(next[next.length - 1]!, end)) {
      next.push(end);
    } else {
      next[next.length - 1] = end;
    }
  }
  return next;
};

export const extractEditableWaypoints = (path: Position[], start?: Position, end?: Position): Position[] => {
  let next = [...path];
  if (start && next.length > 0 && isSamePosition(next[0]!, start)) {
    next = next.slice(1);
  }
  if (end && next.length > 0 && isSamePosition(next[next.length - 1]!, end)) {
    next = next.slice(0, -1);
  }
  return next;
};

export const calculateCableLength = (points: Position[]): number => {
  if (points.length < 2) return 0;
  let length = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const earthRadius = 6371000;
    const dLat = ((curr.lat - prev.lat) * Math.PI) / 180;
    const dLon = ((curr.lng - prev.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((prev.lat * Math.PI) / 180) *
        Math.cos((curr.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    length += earthRadius * c;
  }

  return Math.round(length);
};
