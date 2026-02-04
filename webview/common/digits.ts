const SEGMENTS = [
  { mask: 0x01, points: '1,1 2,0 8,0 9,1 8,2 2,2' },
  { mask: 0x08, points: '9,1 10,2 10,8 9,9 8,8 8,2' },
  { mask: 0x20, points: '9,9 10,10 10,16 9,17 8,16 8,10' },
  { mask: 0x80, points: '9,17 8,18 2,18 1,17 2,16 8,16' },
  { mask: 0x40, points: '1,17 0,16 0,10 1,9 2,10 2,16' },
  { mask: 0x02, points: '1,9 0,8 0,2 1,1 2,2 2,8' },
  { mask: 0x04, points: '1,9 2,8 8,8 9,9 8,10 2,10' },
];

export function createDigit(): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'digit';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 -1 12 20');
  SEGMENTS.forEach((seg) => {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', seg.points);
    poly.dataset.mask = String(seg.mask);
    poly.classList.add('seg');
    svg.appendChild(poly);
  });
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', '11');
  dot.setAttribute('cy', '17');
  dot.setAttribute('r', '1');
  dot.dataset.mask = '16';
  dot.classList.add('seg');
  svg.appendChild(dot);
  wrapper.appendChild(svg);
  return wrapper;
}
