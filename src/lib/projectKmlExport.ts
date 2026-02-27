import type { Cable, Network, Position } from '@/types/ftth';

const KML_MIME_TYPE = 'application/vnd.google-earth.kml+xml';

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const toSafeFileName = (value: string): string => {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return normalized || 'projeto-ftth';
};

const positionToCoordinates = (position: Position): string =>
  `${position.lng.toFixed(6)},${position.lat.toFixed(6)},0`;

const buildPointPlacemark = (
  name: string,
  description: string,
  position: Position,
  styleUrl: string
): string => `
    <Placemark>
      <name>${escapeXml(name)}</name>
      <description>${escapeXml(description)}</description>
      <styleUrl>${styleUrl}</styleUrl>
      <Point>
        <coordinates>${positionToCoordinates(position)}</coordinates>
      </Point>
    </Placemark>`;

const buildLinePlacemark = (
  cable: Cable,
  coordinates: Position[],
  endpointLabel: string
): string => `
    <Placemark>
      <name>${escapeXml(cable.name)}</name>
      <description>${escapeXml(
        `Tipo: ${cable.type} | Modelo: ${cable.model || '-'} | Fibras: ${cable.fiberCount} | Status: ${
          cable.status
        } | Endpoint: ${endpointLabel}`
      )}</description>
      <styleUrl>#line-${escapeXml(cable.type)}</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          ${coordinates.map((point) => positionToCoordinates(point)).join(' ')}
        </coordinates>
      </LineString>
    </Placemark>`;

const getEndpointPositionMap = (network: Network): Map<string, Position> => {
  const map = new Map<string, Position>();
  network.boxes.forEach((box) => map.set(box.id, box.position));
  (network.pops || []).forEach((pop) => map.set(pop.id, pop.position));
  return map;
};

const resolveCableCoordinates = (cable: Cable, endpointMap: Map<string, Position>): Position[] => {
  if (cable.path.length >= 2) return cable.path;
  const start = endpointMap.get(cable.startPoint);
  const end = endpointMap.get(cable.endPoint);
  if (start && end) return [start, end];
  return [];
};

export const buildNetworkKml = (network: Network): string => {
  const endpointMap = getEndpointPositionMap(network);
  const projectDescription = network.description || 'Projeto FTTH';

  const popFolder = `
  <Folder>
    <name>POPs</name>
    ${(network.pops || [])
      .map((pop) =>
        buildPointPlacemark(
          pop.name,
          `Status: ${pop.status}`,
          pop.position,
          '#point-pop'
        )
      )
      .join('\n')}
  </Folder>`;

  const boxFolder = `
  <Folder>
    <name>Caixas</name>
    ${network.boxes
      .map((box) =>
        buildPointPlacemark(
          box.name,
          `Tipo: ${box.type} | Status: ${box.status} | Capacidade: ${box.capacity}`,
          box.position,
          '#point-box'
        )
      )
      .join('\n')}
  </Folder>`;

  const reserveFolder = `
  <Folder>
    <name>Reservas</name>
    ${(network.reserves || [])
      .map((reserve) =>
        buildPointPlacemark(
          reserve.name,
          `Status: ${reserve.status}`,
          reserve.position,
          '#point-reserve'
        )
      )
      .join('\n')}
  </Folder>`;

  const cableFolder = `
  <Folder>
    <name>Cabos</name>
    ${network.cables
      .map((cable) => {
        const coordinates = resolveCableCoordinates(cable, endpointMap);
        if (coordinates.length < 2) return '';
        const endpointLabel = `${cable.startPoint || '-'} -> ${cable.endPoint || '-'}`;
        return buildLinePlacemark(cable, coordinates, endpointLabel);
      })
      .filter((entry) => entry.length > 0)
      .join('\n')}
  </Folder>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(network.name)}</name>
    <description>${escapeXml(projectDescription)}</description>

    <Style id="point-pop">
      <IconStyle>
        <color>ff2ecc71</color>
        <scale>1.15</scale>
      </IconStyle>
      <LabelStyle><scale>0.9</scale></LabelStyle>
    </Style>

    <Style id="point-box">
      <IconStyle>
        <color>ff3498db</color>
        <scale>1.1</scale>
      </IconStyle>
      <LabelStyle><scale>0.9</scale></LabelStyle>
    </Style>

    <Style id="point-reserve">
      <IconStyle>
        <color>ff16a085</color>
        <scale>1.05</scale>
      </IconStyle>
      <LabelStyle><scale>0.9</scale></LabelStyle>
    </Style>

    <Style id="line-backbone">
      <LineStyle><color>ff0033cc</color><width>5</width></LineStyle>
    </Style>
    <Style id="line-feeder">
      <LineStyle><color>ff0099ff</color><width>4</width></LineStyle>
    </Style>
    <Style id="line-distribution">
      <LineStyle><color>ff00cc66</color><width>3</width></LineStyle>
    </Style>
    <Style id="line-drop">
      <LineStyle><color>ff00ccff</color><width>2</width></LineStyle>
    </Style>

    ${popFolder}
    ${boxFolder}
    ${reserveFolder}
    ${cableFolder}
  </Document>
</kml>`;
};

export const downloadNetworkAsKml = (network: Network): void => {
  if (typeof window === 'undefined') return;
  const kmlContent = buildNetworkKml(network);
  const blob = new Blob([kmlContent], { type: KML_MIME_TYPE });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${toSafeFileName(network.name)}.kml`;
  anchor.click();

  URL.revokeObjectURL(url);
};
