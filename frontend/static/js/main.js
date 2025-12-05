const treeSvgElement = document.getElementById('tree-viz');
const statusEl = document.getElementById('status');
const uploadBtn = document.getElementById('upload-btn');
const uploadInput = document.getElementById('tree-file');
const traitSummaryContainer = document.getElementById('trait-summary');
const traitSearchInput = document.getElementById('trait-search');
const traitLimitSelect = document.getElementById('trait-limit');
const colorSelect = document.getElementById('color-select');
const layoutSelect = document.getElementById('layout-select');
const nodeSizeInput = document.getElementById('node-size');
const toggleLabelsCheckbox = document.getElementById('toggle-labels');
const resetTreeButton = document.getElementById('reset-tree');
const sortSelect = document.getElementById('sort-select');
const colorDirectionSelect = document.getElementById('color-direction');
const hpdSelect = document.getElementById('hpd-select');
const hpdColorInput = document.getElementById('hpd-color');
const latestDateInput = document.getElementById('latest-date');
const exportTreeButton = document.getElementById('export-tree');
const exportMapGeoJSONButton = document.getElementById('export-map-geojson');
const exportMapImageButton = document.getElementById('export-map-image');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');
const sidebar = document.getElementById('sidebar');
const sidebarHandleBtn = document.getElementById('sidebar-handle');
const workspace = document.getElementById('workspace');
const metadataInput = document.getElementById('metadata-file');
const metadataButton = document.getElementById('metadata-btn');
const timelineSlider = document.getElementById('timeline-slider');
const playMigrationButton = document.getElementById('play-migration');
const timelineLabel = document.getElementById('timeline-label');
const brushToggleCheckbox = document.getElementById('enable-brush');
const selectionInfoEl = document.getElementById('selection-info');
const selectionInfoViewState = {
  placeholder: null,
  single: null,
  multi: null,
  multiCount: null,
  multiSamples: null,
  multiTotal: null,
  currentView: null,
};
const supportFileInput = document.getElementById('support-file');
const pathTopKInput = document.getElementById('path-top-k');
const runDiscreteAnalysisButton = document.getElementById('run-discrete-analysis');
const discreteStatusEl = document.getElementById('discrete-status');
const migrationMatrixButton = document.getElementById('refresh-migration-matrix');
const migrationMatrixStatusEl = document.getElementById('migration-matrix-status');
const migrationMatrixTable = document.getElementById('migration-matrix-table');
const rootPosteriorTable = document.getElementById('root-origin-table');
const pathwaysTable = document.getElementById('pathways-table');
const downloadNodesLink = document.getElementById('download-nodes');
const downloadEdgesLink = document.getElementById('download-edges');
const downloadGeojsonLink = document.getElementById('download-geojson');
const downloadSummaryLink = document.getElementById('download-summary');
const mapTileUrlInput = document.getElementById('map-tile-url');
const applyMapLinkButton = document.getElementById('apply-map-link');
const mapConfigInput = document.getElementById('map-config-file');
const applyMapConfigButton = document.getElementById('apply-map-config');
const resetMapButton = document.getElementById('reset-map');
const mapStatusEl = document.getElementById('map-status');
const treeMapContainer = document.getElementById('tree-map-container');
const treeMapResizer = document.getElementById('tree-map-resizer');
const treeHeightResizer = document.getElementById('tree-height-resizer');
const mapHeightResizer = document.getElementById('map-height-resizer');
const treePanelElement = document.getElementById('tree-panel-wrapper') || document.getElementById('tree-panel');
const mapPanelElement = document.getElementById('map-panel');
const rootPosteriorBody = rootPosteriorTable ? rootPosteriorTable.querySelector('tbody') : null;
const pathwaysBody = pathwaysTable ? pathwaysTable.querySelector('tbody') : null;
const comparisonFilesInput = document.getElementById('comparison-files');
const comparisonUploadBtn = document.getElementById('comparison-upload-btn');
const comparisonManualFilenameInput = document.getElementById('comparison-manual-filename');
const comparisonManualLabelInput = document.getElementById('comparison-manual-label');
const comparisonAddManualBtn = document.getElementById('comparison-add-manual');
const comparisonRunBtn = document.getElementById('comparison-run-btn');
const comparisonClearBtn = document.getElementById('comparison-clear-btn');
const comparisonTopKInput = document.getElementById('comparison-top-k');
const comparisonStatusEl = document.getElementById('comparison-status');
const comparisonTreeList = document.getElementById('comparison-tree-list');
const comparisonTreesTable = document.getElementById('comparison-trees-table');
const comparisonPathsTable = document.getElementById('comparison-paths-table');
const comparisonTreesBody = comparisonTreesTable ? comparisonTreesTable.querySelector('tbody') : null;
const comparisonPathsBody = comparisonPathsTable ? comparisonPathsTable.querySelector('tbody') : null;

let treeSvg = null;
let leafletMap;
let geoLayerGroup;
let animationLayerGroup;
let selectionLayerGroup;
let nodeCoordinateCache = new Map();
let baseTileLayer = null;

const defaultTileOptions = {
  maxZoom: 18,
  attribution: '© OpenStreetMap contributors',
};

const defaultMapConfig = {
  name: 'OpenStreetMap',
  tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
};

let currentMapConfig = null;

const colorState = {
  trait: null,
  scale: null,
  type: 'categorical',
  traitInfo: null,
  domain: null,
  label: 'Default',
};

const vizState = {
  colorTrait: 'auto',
  layout: 'time',
  showLabels: false,
  nodeRadius: 5,
  sortOrder: 'increasing',
  verticalScale: 1.0,
  colorDirection: 'increasing',
  latestDate: null,
  zoomTransform: null,
  tipColor: '#2563eb',
  hpdMode: 'none',
  hpdColor: '#f97316',
  legendPosition: null,
  legendScale: 1,
};

const rootElement = document.documentElement;

const layoutState = {
  treePanelRatio: 50,
  treePanelHeight: 640,
  mapPanelHeight: 640,
};

if (latestDateInput && latestDateInput.value) {
  const parsedInitialDate = new Date(latestDateInput.value);
  if (!Number.isNaN(parsedInitialDate.getTime())) {
    vizState.latestDate = parsedInitialDate;
  }
}

let traitStatsCache = null;
let controlsInitialized = false;
let zoomBehavior = null;
let zoomLayer = null;
let traitSummaryCache = null;

function ensureD3() {
  if (typeof window.d3 === 'undefined') {
    setStatus('Unable to load D3.js. Check your network connection or bundle the dependency locally.');
    return false;
  }
  if (!treeSvg) {
    treeSvg = window.d3.select(treeSvgElement);
  }
  return true;
}

function ensureLeaflet() {
  if (typeof window.L === 'undefined') {
    setStatus('Unable to load Leaflet. Check your network connection or include the dependency locally.');
    return false;
  }
  return true;
}

function applyTreeMapLayout(ratio = layoutState.treePanelRatio) {
  if (!treePanelElement || !mapPanelElement) {
    return;
  }
  const min = 22;
  const max = 78;
  const numericRatio = Number.isFinite(Number(ratio)) ? Number(ratio) : layoutState.treePanelRatio;
  const clamped = Math.min(max, Math.max(min, numericRatio || 50));
  const mapRatio = 100 - clamped;
  layoutState.treePanelRatio = clamped;
  treePanelElement.style.flexBasis = `${clamped}%`;
  mapPanelElement.style.flexBasis = `${mapRatio}%`;
}

function applyTreePanelHeight(height = layoutState.treePanelHeight) {
  const min = 360;
  const max = 1400;
  const value = Number.isFinite(height) ? height : layoutState.treePanelHeight;
  const clamped = Math.min(max, Math.max(min, value));
  layoutState.treePanelHeight = clamped;
  if (rootElement) {
    rootElement.style.setProperty('--tree-panel-height', `${clamped}px`);
  }
}

function applyMapPanelHeight(height = layoutState.mapPanelHeight) {
  const min = 360;
  const max = 1400;
  const value = Number.isFinite(height) ? height : layoutState.mapPanelHeight;
  const clamped = Math.min(max, Math.max(min, value));
  layoutState.mapPanelHeight = clamped;
  if (rootElement) {
    rootElement.style.setProperty('--map-panel-height', `${clamped}px`);
  }
  if (leafletMap && typeof leafletMap.invalidateSize === 'function') {
    requestAnimationFrame(() => leafletMap.invalidateSize());
  }
}

function initializeLayoutFromStyles() {
  if (!rootElement || typeof window === 'undefined' || !window.getComputedStyle) {
    applyTreePanelHeight(layoutState.treePanelHeight);
    applyMapPanelHeight(layoutState.mapPanelHeight);
    return;
  }
  const computed = window.getComputedStyle(rootElement);
  const treeHeight = Number.parseFloat(computed.getPropertyValue('--tree-panel-height'));
  if (Number.isFinite(treeHeight) && treeHeight > 0) {
    layoutState.treePanelHeight = treeHeight;
  }
  const mapHeight = Number.parseFloat(computed.getPropertyValue('--map-panel-height'));
  if (Number.isFinite(mapHeight) && mapHeight > 0) {
    layoutState.mapPanelHeight = mapHeight;
  }
  applyTreePanelHeight(layoutState.treePanelHeight);
  applyMapPanelHeight(layoutState.mapPanelHeight);
}

function createHeightResizer(handle, getHeight, setHeight, onStop) {
  if (!handle || typeof getHeight !== 'function' || typeof setHeight !== 'function') {
    return;
  }
  let dragging = false;
  let startY = 0;
  let startHeight = 0;

  const handlePointerMove = (event) => {
    if (!dragging) {
      return;
    }
    const deltaY = event.clientY - startY;
    setHeight(startHeight + deltaY);
  };

  const stopDragging = () => {
    if (!dragging) {
      return;
    }
    dragging = false;
    document.body.classList.remove('is-resizing');
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopDragging);
    if (typeof onStop === 'function') {
      onStop();
    }
  };

  handle.addEventListener('pointerdown', (event) => {
    if (typeof event.button === 'number' && event.button !== 0) {
      return;
    }
    dragging = true;
    startY = event.clientY;
    startHeight = getHeight();
    document.body.classList.add('is-resizing');
    event.preventDefault();
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
  });

  handle.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }
    const delta = event.key === 'ArrowUp' ? -20 : 20;
    setHeight(getHeight() + delta);
    if (typeof onStop === 'function') {
      onStop();
    }
    event.preventDefault();
  });
}

function setupTreeMapResizer() {
  if (!treeMapResizer || !treeMapContainer) {
    return;
  }
  let dragging = false;

  const handlePointerMove = (event) => {
    if (!dragging || !treeMapContainer) {
      return;
    }
    const rect = treeMapContainer.getBoundingClientRect();
    const width = rect.width || 1;
    const relativeX = Math.min(Math.max(event.clientX - rect.left, 0), width);
    const ratio = (relativeX / width) * 100;
    applyTreeMapLayout(ratio);
    if (leafletMap && typeof leafletMap.invalidateSize === 'function') {
      leafletMap.invalidateSize();
    }
  };

  const stopDragging = () => {
    if (!dragging) {
      return;
    }
    dragging = false;
    document.body.classList.remove('is-resizing');
    treeMapResizer.classList.remove('is-active');
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopDragging);
    if (cachedPayload) {
      refreshVisualizations();
    }
  };

  treeMapResizer.addEventListener('pointerdown', (event) => {
    if (typeof event.button === 'number' && event.button !== 0) {
      return;
    }
    dragging = true;
    document.body.classList.add('is-resizing');
    treeMapResizer.classList.add('is-active');
    event.preventDefault();
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
  });

  treeMapResizer.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    const delta = event.key === 'ArrowLeft' ? -2 : 2;
    applyTreeMapLayout(layoutState.treePanelRatio + delta);
    if (cachedPayload) {
      refreshVisualizations();
    }
    if (leafletMap && typeof leafletMap.invalidateSize === 'function') {
      requestAnimationFrame(() => leafletMap.invalidateSize());
    }
    event.preventDefault();
  });
}

function setupPanelResizers() {
  setupTreeMapResizer();
  if (treeHeightResizer) {
    createHeightResizer(
      treeHeightResizer,
      () => layoutState.treePanelHeight,
      (value) => applyTreePanelHeight(value),
    );
  }
  if (mapHeightResizer) {
    createHeightResizer(
      mapHeightResizer,
      () => layoutState.mapPanelHeight,
      (value) => applyMapPanelHeight(value),
      () => {
        if (leafletMap && typeof leafletMap.invalidateSize === 'function') {
          leafletMap.invalidateSize();
        }
      },
    );
  }
}

let cachedPayload = null;
let cachedFilename = null;
let currentFilename = null;

const metadataState = {
  records: new Map(),
  columns: [],
  idField: null,
  filename: null,
  columnDisplayNames: new Map(),
  appliedColumns: [],
  metadataTraits: new Set(),
  columnKeyMap: new Map(),
};

const animationState = {
  events: [],
  nodeAppearances: [],
  domain: null,
  currentYear: null,
  playing: false,
  rafId: null,
  lastTimestamp: null,
  referenceDate: null,
  referenceYear: null,
  appearanceById: new Map(),
  useTimelineFilter: false,
};

const selectionState = {
  nodeIds: new Set(),
};

const brushState = {
  enabled: false,
  selectedIds: new Set(),
};

const treeRenderState = {
  nodes: [],
  nodeIndex: new Map(),
  nodeGroups: null,
  leafCircles: null,
  leafLabels: null,
  branchSelection: null,
  brush: null,
  brushLayer: null,
  margin: null,
  timelineGridLines: null,
  leafIdSet: new Set(),
  layoutSize: null,
};

const mapRenderState = {
  markers: new Map(),
  markerMeta: new Map(),
  edgeLayers: [],
  nodeById: new Map(),
  hpdByNode: new Map(),
  displayedNodeIds: new Set(),
  hpdLayerGroup: null,
};

let cachedNodeMap = new Map();

const discreteState = {
  analysisId: null,
  exports: {},
  topK: 10,
};

let comparisonItemCounter = 0;

const comparisonState = {
  items: [],
  topK: Number.parseInt(comparisonTopKInput?.value, 10) || 10,
  result: null,
};

comparisonState.items = loadPersistedComparisonItems();

async function fetchTree(filename = null) {
  const params = new URLSearchParams();
  if (filename) {
    params.set('filename', filename);
  }
  const url = params.toString() ? `/api/tree?${params.toString()}` : '/api/tree';
  const response = await fetch(url);
  if (!response.ok) {
    const errorMessage = await buildErrorMessage(response,
      response.status === 404
        ? 'Default MCC tree not found. Please upload a file first.'
        : 'Unable to load tree data.');
    throw new Error(`Failed to load tree: ${errorMessage}`);
  }
  return response.json();
}

async function buildErrorMessage(response, fallback) {
  let message = fallback;
  try {
    const data = await response.clone().json();
    if (typeof data === 'string') {
      message = data;
    } else if (data && data.detail) {
      message = data.detail;
    }
  } catch (err) {
    try {
      const text = await response.clone().text();
      if (text) {
        message = text;
      }
    } catch (innerErr) {
      console.error('Failed to read error response', innerErr);
    }
  }
  return message || response.statusText || 'Unknown error';
}

function buildHierarchy(nodes) {
  const nodeMap = new Map();
  nodes.forEach((node) => {
    nodeMap.set(node.id, { ...node, children: [] });
  });

  let root = null;
  nodes.forEach((node) => {
    const enriched = nodeMap.get(node.id);
    if (!node.parent_id) {
      root = enriched;
      return;
    }
    const parent = nodeMap.get(node.parent_id);
    if (parent) {
      parent.children.push(enriched);
    }
  });

  return root;
}

function sortHierarchyByLeafCount(root, order) {
  if (!root) {
    return;
  }

  computeLeafCounts(root);

  const comparator = order === 'decreasing'
    ? (a, b) => ascendingLeafCompare(a, b)
    : (a, b) => descendingLeafCompare(a, b);

  root.each((node) => {
    if (node.children && node.children.length > 1) {
      node.children.sort(comparator);
    }
  });
}

function descendingLeafCompare(a, b) {
  if (b.leafCount === a.leafCount) {
    return (a.data.label || a.data.id || '').localeCompare(b.data.label || b.data.id || '');
  }
  return b.leafCount - a.leafCount;
}

function ascendingLeafCompare(a, b) {
  if (a.leafCount === b.leafCount) {
    return (a.data.label || a.data.id || '').localeCompare(b.data.label || b.data.id || '');
  }
  return a.leafCount - b.leafCount;
}

function computeLeafCounts(node) {
  if (!node.children || node.children.length === 0) {
    node.leafCount = 1;
    return node.leafCount;
  }
  let total = 0;
  node.children.forEach((child) => {
    total += computeLeafCounts(child);
  });
  node.leafCount = total;
  return node.leafCount;
}

function getCurrentTransform() {
  if (vizState.zoomTransform && typeof vizState.zoomTransform.applyX === 'function') {
    return vizState.zoomTransform;
  }
  if (ensureD3()) {
    return window.d3.zoomIdentity;
  }
  return {
    k: 1,
    applyX: (value) => value,
    applyY: (value) => value,
  };
}

function applyTreeZoomStyles(transform = null) {
  const activeTransform = transform || getCurrentTransform();
  const scale = Number.isFinite(activeTransform.k) && activeTransform.k > 0 ? activeTransform.k : 1;

  if (treeRenderState.leafCircles) {
    const radius = Math.max(1.5, vizState.nodeRadius / scale);
    treeRenderState.leafCircles.attr('r', radius);
  }

  if (treeRenderState.leafLabels) {
    const fontSize = Math.max(7, Math.min(18, 11 / scale));
    const offset = (vizState.nodeRadius + 6) / scale;
    treeRenderState.leafLabels
      .attr('font-size', fontSize)
      .attr('x', offset);
  }

  if (treeRenderState.branchSelection) {
    const stroke = Math.max(0.6, 1.3 / scale);
    treeRenderState.branchSelection.attr('stroke-width', stroke);
  }

  if (treeRenderState.timelineGridLines) {
    const stroke = Math.max(0.4, 1 / scale);
    treeRenderState.timelineGridLines.attr('stroke-width', stroke);
  }
}

function getNodeMetric(nodeData) {
  if (!nodeData) {
    return 0;
  }
  if (typeof nodeData.time_before_present === 'number') {
    return nodeData.time_before_present;
  }
  if (typeof nodeData.time_from_root === 'number') {
    return nodeData.time_from_root;
  }
  return 0;
}

function drawTimelineGrid(container, xScale, height) {
  const d3 = window.d3;
  const ticks = xScale.ticks(Math.min(12, Math.max(4, Math.floor((xScale.range()[1] - xScale.range()[0]) / 120))));
  const grid = container.append('g')
    .attr('class', 'timeline-grid')
    .attr('stroke', '#e5e7eb')
    .attr('stroke-dasharray', '4,4');

  const lines = grid.selectAll('line')
    .data(ticks)
    .join('line')
    .attr('x1', (d) => xScale(d))
    .attr('x2', (d) => xScale(d))
    .attr('y1', 0)
    .attr('y2', height)
    .attr('opacity', 0.6);

  return lines;
}

function buildColorScale(nodes, preferredTrait = 'auto', direction = 'increasing') {
  const d3 = window.d3;
  if (!traitStatsCache) {
    traitStatsCache = analyzeTraits(nodes);
  }
  const stats = traitStatsCache;

  const selectCandidate = (traitKey, options = {}) => {
    const { enforceCategoryLimit = true } = options;
    if (!traitKey) {
      return null;
    }
    const info = stats.get(traitKey);
    if (!info) {
      return null;
    }
    const allowLargeCategory = isMetadataTraitKey(traitKey);
    if (info.type === 'categorical') {
      if (!info.values || info.values.size <= 1) {
        return null;
      }
      if (info.values.size > 18 && enforceCategoryLimit && !allowLargeCategory) {
        return null;
      }
    } else if (info.type === 'numeric') {
      if (!Number.isFinite(info.min) || !Number.isFinite(info.max) || info.min === info.max) {
        return null;
      }
    }
    return { trait: traitKey, info };
  };

  let selected = null;

  if (preferredTrait && preferredTrait !== 'auto') {
    selected = selectCandidate(preferredTrait, { enforceCategoryLimit: false });
  }

  if (!selected) {
    let bestScore = -Infinity;
    stats.forEach((info, traitKey) => {
      const candidate = selectCandidate(traitKey);
      if (!candidate) {
        return;
      }
      const coverage = info.count / nodes.length;
      if (coverage > bestScore) {
        bestScore = coverage;
        selected = candidate;
      }
    });
  }

  if (!selected) {
    return {
      trait: null,
      label: 'Default',
      type: 'categorical',
      scale: null,
      info: null,
      domain: null,
      getColor: (node) => {
        const leafSet = treeRenderState.leafIdSet;
        const tipColour = vizState.tipColor || '#2563eb';
        if (leafSet && node && leafSet.has(node.id)) {
          return tipColour;
        }
        return '#1b4965';
      },
    };
  }

  const { trait, info } = selected;
  const label = trait === '__label_prefix'
    ? 'Label Prefix (sample ID)'
    : trait === 'height'
      ? 'Height (time before present)'
      : trait;

  if (info.type === 'numeric') {
    const domain = direction === 'increasing'
      ? [info.min, info.max]
      : [info.max, info.min];
    const scale = d3.scaleSequential().domain(domain).interpolator(d3.interpolateTurbo);
    return {
      trait,
      label,
      type: 'numeric',
      scale,
      info,
      domain: [info.min, info.max],
      scaleDomain: domain,
      getColor(nodeData) {
        const value = getTraitRawValue(nodeData, trait, info);
        if (!Number.isFinite(value)) {
          const leafSet = treeRenderState.leafIdSet;
          const tipColour = vizState.tipColor || '#2563eb';
          if (leafSet && nodeData && leafSet.has(nodeData.id)) {
            return tipColour;
          }
          return '#1b4965';
        }
        return scale(value);
      },
    };
  }

  const values = Array.from(info.values.keys()).sort();
  const palette = buildPalette(values.length);
  const scale = d3.scaleOrdinal().domain(values).range(palette);
  return {
    trait,
    label,
    type: 'categorical',
    scale,
    info,
    domain: values,
    scaleDomain: values,
    getColor(nodeData) {
      const value = getTraitRawValue(nodeData, trait, info);
      if (value === null || value === undefined) {
        return nodeData.parent_id ? '#2563eb' : '#1b4965';
      }
      return scale(value);
    },
  };
}

function drawLegend(svg, colorConfig, viewWidth, offsetY) {
  svg.selectAll('.tree-legend').remove();
  svg.selectAll('defs.tree-legend-def').remove();

  if (!colorConfig.scale || !colorConfig.trait) {
    return;
  }

  const d3 = window.d3;
  const storedPosition = vizState.legendPosition;
  const legendPosition = storedPosition
    ? { x: storedPosition.x, y: storedPosition.y }
    : { x: 16, y: offsetY };
  const minLegendScale = 0.7;
  const maxLegendScale = 2.5;
  const clampLegendScale = (value) => Math.min(maxLegendScale, Math.max(minLegendScale, value || 1));
  const initialScale = clampLegendScale(vizState.legendScale);
  vizState.legendScale = initialScale;

  if (!storedPosition) {
    vizState.legendPosition = { ...legendPosition };
  }

  const legend = svg.append('g')
    .attr('class', 'tree-legend')
    .attr('transform', `translate(${legendPosition.x},${legendPosition.y})`);
  const legendContent = legend.append('g')
    .attr('class', 'tree-legend-content')
    .attr('transform', `scale(${initialScale})`);

  if (d3 && d3.drag) {
    const dragBehaviour = d3.drag()
      .on('start', () => {
        legend.raise();
      })
      .on('drag', (event) => {
        legendPosition.x += event.dx;
        legendPosition.y += event.dy;
        vizState.legendPosition = { ...legendPosition };
        legend.attr('transform', `translate(${legendPosition.x},${legendPosition.y})`);
      });
    legend.call(dragBehaviour);
  }

  legend.on('wheel', (event) => {
    if (!event) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.15 : -0.15;
    const nextScale = clampLegendScale((vizState.legendScale || 1) + delta);
    if (nextScale === vizState.legendScale) {
      return;
    }
    vizState.legendScale = nextScale;
    legendContent.attr('transform', `scale(${nextScale})`);
  });

  legendContent.append('text')
    .text(colorConfig.label ? `Node colour: ${colorConfig.label}` : 'Node colour')
    .attr('fill', '#1f2937')
    .attr('font-size', 12)
    .attr('font-weight', 600)
    .attr('dy', 0);

  if (colorConfig.type === 'numeric') {
    const defs = svg.append('defs').attr('class', 'tree-legend-def');
    const gradientId = `tree-legend-gradient-${Date.now()}`;
    const gradient = defs.append('linearGradient')
      .attr('id', gradientId)
      .attr('x1', '0%')
      .attr('x2', '100%')
      .attr('y1', '0%')
      .attr('y2', '0%');

    const domain = colorConfig.scaleDomain || colorConfig.domain;
    const steps = 10;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const value = domain[0] + (domain[1] - domain[0]) * t;
      gradient.append('stop')
        .attr('offset', `${t * 100}%`)
        .attr('stop-color', colorConfig.scale(value));
    }

    const legendBody = legendContent.append('g').attr('transform', 'translate(0,16)');
    legendBody.append('rect')
      .attr('width', 160)
      .attr('height', 12)
      .attr('rx', 2)
      .attr('fill', `url(#${gradientId})`);

    const [minValue, maxValue] = colorConfig.domain;
    legendBody.append('text')
      .text(formatNumber(minValue))
      .attr('x', 0)
      .attr('y', 28)
      .attr('fill', '#475569')
      .attr('font-size', 11);

    legendBody.append('text')
      .text(formatNumber(maxValue))
      .attr('x', 160)
      .attr('y', 28)
      .attr('text-anchor', 'end')
      .attr('fill', '#475569')
      .attr('font-size', 11);
    return;
  }

  const values = colorConfig.domain || [];
  if (!values.length) {
    return;
  }

  const item = legendContent.append('g')
    .attr('transform', 'translate(0,16)');

  values.forEach((val, idx) => {
    const group = item.append('g').attr('transform', `translate(0,${idx * 18})`);
    group.append('rect')
      .attr('width', 12)
      .attr('height', 12)
      .attr('rx', 2)
      .attr('fill', colorConfig.scale(val));
    group.append('text')
      .text(val)
      .attr('x', 18)
      .attr('y', 10)
      .attr('fill', '#1f2937')
      .attr('font-size', 11);
  });
}

function buildPalette(size) {
  const d3 = window.d3;
  const base = [...(d3.schemeTableau10 || []), ...(d3.schemeSet3 || []), '#0f172a', '#2563eb', '#f97316', '#0ea5e9', '#22c55e', '#facc15'];
  if (size <= base.length) {
    return base.slice(0, size);
  }
  const extra = [];
  for (let i = 0; i < size; i += 1) {
    extra.push(d3.interpolateSpectral(i / (size - 1)));
  }
  return extra;
}

function getTraitDisplayName(traitKey) {
  if (!traitKey) {
    return 'Default';
  }
  if (traitKey === '__label_prefix') {
    return 'Label Prefix (sample ID)';
  }
  if (traitKey === 'height') {
    return 'Height (time before present)';
  }
  if (metadataState.columnDisplayNames instanceof Map && metadataState.columnDisplayNames.has(traitKey)) {
    return metadataState.columnDisplayNames.get(traitKey);
  }
  return traitKey;
}

function isMetadataTraitKey(traitKey) {
  if (!traitKey || !(metadataState.metadataTraits instanceof Set)) {
    return false;
  }
  return metadataState.metadataTraits.has(traitKey);
}

function updateTraitOptions(nodes) {
  if (!colorSelect) {
    return;
  }
  traitStatsCache = analyzeTraits(nodes);
  const entries = [];
  traitStatsCache.forEach((info, key) => {
    const isNumeric = info.type === 'numeric';
    const isCategorical = info.type === 'categorical';
    const allowLargeCategory = isMetadataTraitKey(key);
    if (isCategorical && (!info.values || info.values.size <= 1)) {
      return;
    }
    if (isCategorical && info.values && info.values.size > 18 && !allowLargeCategory) {
      return;
    }
    entries.push({ key, label: getTraitDisplayName(key), info });
  });

  const getTraitPriority = (entry) => {
    if (isMetadataTraitKey(entry.key)) {
      return 0;
    }
    if (entry.key === 'height') {
      return 2;
    }
    return 1;
  };

  entries.sort((a, b) => {
    const priorityDiff = getTraitPriority(a) - getTraitPriority(b);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return (b.info.count / nodes.length) - (a.info.count / nodes.length);
  });

  const currentValue = vizState.colorTrait || 'auto';

  colorSelect.innerHTML = '';
  const autoOption = document.createElement('option');
  autoOption.value = 'auto';
  autoOption.textContent = 'Auto (best trait)';
  colorSelect.appendChild(autoOption);

  entries.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.key;
    option.textContent = `${entry.label}${entry.info.type === 'numeric' ? ' (numeric)' : ''}`;
    option.dataset.type = entry.info.type;
    colorSelect.appendChild(option);
  });

  const available = new Set(['auto', ...entries.map((entry) => entry.key)]);
  let desired = currentValue;
  if (!available.has(desired)) {
    desired = 'auto';
    vizState.colorTrait = 'auto';
  }
  colorSelect.value = desired;
}

function getNodeColor(node) {
  if (colorState.scale && colorState.trait && colorState.traitInfo) {
    const raw = getTraitRawValue(node, colorState.trait, colorState.traitInfo);
    if (raw !== null && raw !== undefined) {
      return colorState.scale(raw);
    }
  }
  const leafSet = treeRenderState.leafIdSet;
  const tipColour = vizState.tipColor || '#2563eb';
  if (leafSet && node && leafSet.has(node.id)) {
    return tipColour;
  }
  return '#1b4965';
}

function refreshVisualizations() {
  if (!cachedPayload) {
    return;
  }
  renderTree(cachedPayload);
  renderMap(cachedPayload);
  renderTraits(cachedPayload);
}

function analyzeTraits(nodes) {
  const stats = new Map();
  const ensureEntry = (key, typeHint = 'categorical') => {
    if (!stats.has(key)) {
      stats.set(key, {
        type: typeHint,
        values: typeHint === 'categorical' ? new Map() : null,
        count: 0,
        min: Infinity,
        max: -Infinity,
      });
    }
    const entry = stats.get(key);
    if (typeHint === 'numeric') {
      entry.type = 'numeric';
      if (!Number.isFinite(entry.min)) {
        entry.min = Infinity;
        entry.max = -Infinity;
      }
    }
    return entry;
  };

  nodes.forEach((node) => {
    const traits = node.traits || {};
    Object.entries(traits).forEach(([key, value]) => {
      const resolved = resolveValueInfo(value);
      if (!resolved) {
        return;
      }
      const entry = ensureEntry(key, resolved.type);
      entry.count += 1;
      if (resolved.type === 'numeric') {
        entry.min = Math.min(entry.min, resolved.value);
        entry.max = Math.max(entry.max, resolved.value);
      } else {
        entry.values.set(resolved.value, (entry.values.get(resolved.value) || 0) + 1);
      }
    });

    const prefix = deriveLabelPrefix(node.label);
    if (prefix) {
      const entry = ensureEntry('__label_prefix', 'categorical');
      entry.count += 1;
      entry.values.set(prefix, (entry.values.get(prefix) || 0) + 1);
    }

    const heightValue = getNodeMetric(node);
    if (Number.isFinite(heightValue)) {
      const entry = ensureEntry('height', 'numeric');
      entry.count += 1;
      entry.min = Math.min(entry.min, heightValue);
      entry.max = Math.max(entry.max, heightValue);
    }
  });

  stats.forEach((entry) => {
    if (entry.type === 'numeric') {
      if (!Number.isFinite(entry.min) || !Number.isFinite(entry.max)) {
        entry.min = 0;
        entry.max = 0;
      }
    }
  });

  return stats;
}

function resolveValueInfo(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = resolveValueInfo(item);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }
  const numeric = extractNumericValue(value);
  if (numeric !== null) {
    return { type: 'numeric', value: numeric };
  }
  const categorical = extractCategoricalValue(value);
  if (categorical !== null) {
    return { type: 'categorical', value: categorical };
  }
  return null;
}

function extractNumericValue(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    if (!/^[-+]?\d*(\.\d+)?$/.test(trimmed)) {
      return null;
    }
    return numeric;
  }
  return null;
}

function extractCategoricalValue(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toFixed(3) : null;
  }
  return null;
}

function deriveLabelPrefix(label) {
  if (!label || typeof label !== 'string') {
    return null;
  }
  const segments = label.split(/[|/]/).filter(Boolean);
  if (!segments.length) {
    return null;
  }
  return segments[0];
}

function getTraitRawValue(nodeData, traitKey, info) {
  if (!nodeData || !traitKey || !info) {
    return null;
  }
  if (traitKey === '__label_prefix') {
    return deriveLabelPrefix(nodeData.label);
  }
  if (traitKey === 'height') {
    return getNodeMetric(nodeData);
  }
  const traits = nodeData.traits || {};
  const rawValue = traits[traitKey];
  if (info.type === 'numeric') {
    return extractNumericFromValue(rawValue);
  }
  return extractCategoricalFromValue(rawValue);
}

function extractNumericFromValue(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = extractNumericFromValue(item);
      if (resolved !== null && resolved !== undefined) {
        return resolved;
      }
    }
    return null;
  }
  return extractNumericValue(value);
}

function extractCategoricalFromValue(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = extractCategoricalFromValue(item);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }
  return extractCategoricalValue(value);
}

function formatTraitValue(value, info) {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  if (!info) {
    return stringifyValue(value);
  }
  if (info.type === 'numeric') {
    return formatNumber(value);
  }
  return `${value}`;
}

function formatNumber(value, digits = 3) {
  if (!Number.isFinite(value)) {
    return 'N/A';
  }
  if (Math.abs(value) >= 1000 || Math.abs(value) < 0.01) {
    return value.toExponential(2);
  }
  return Number.parseFloat(value.toFixed(digits)).toString();
}

function formatDateLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function downloadBlob(blob, filename) {
  if (!blob) {
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function renderTree(payload) {
  if (!ensureD3()) {
    return;
  }
  const d3 = window.d3;
  const rootData = buildHierarchy(payload.nodes);
  if (!rootData) {
    treeSvg.selectAll('*').remove();
    return;
  }

  const root = d3.hierarchy(rootData, (d) => d.children);
  sortHierarchyByLeafCount(root, vizState.sortOrder);
  const width = treeSvg.node().clientWidth || 1100;
  const leavesCount = root.leaves().length;
  const baseRowHeight = vizState.layout === 'cladogram' ? 14 : 18;
  const rowHeight = baseRowHeight * vizState.verticalScale;
  const minHeight = 520;
  const maxHeight = 900;
  const height = Math.max(minHeight, Math.min(rowHeight * Math.max(leavesCount, 1), maxHeight));
  const margin = { top: 40, right: 110, bottom: 56, left: 260 };

  const viewWidth = width + margin.left + margin.right;
  const viewHeight = height + margin.top + margin.bottom;

  treeSvg.attr('viewBox', `0 0 ${viewWidth} ${viewHeight}`);
  treeSvg.selectAll('*').remove();

  treeRenderState.brushLayer = null;
  treeRenderState.brush = null;
  treeRenderState.timelineGridLines = null;

  zoomLayer = treeSvg.append('g');
  const g = zoomLayer.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  if (!zoomBehavior) {
    zoomBehavior = d3.zoom()
      .scaleExtent([0.5, 16])
      .filter((event) => {
        if (event.type === 'wheel') {
          return !event.shiftKey;
        }
        if (brushState.enabled) {
          if (event.type === 'mousedown') {
            return false;
          }
          if (event.type === 'touchstart') {
            return false;
          }
          return event.type !== 'dblclick';
        }
        if (event.type === 'mousedown') {
          return event.button === 0 && !event.shiftKey && !event.ctrlKey;
        }
        if (event.type === 'touchstart') {
          return !event.shiftKey;
        }
        return !event.shiftKey;
      })
      .on('zoom', (event) => {
        vizState.zoomTransform = event.transform;
        zoomLayer.attr('transform', event.transform.toString());
        applyTreeZoomStyles(event.transform);
      });
  }

  zoomBehavior
    .translateExtent([[-margin.left, -margin.top], [viewWidth, viewHeight]])
    .extent([[0, 0], [viewWidth, viewHeight]]);

  treeSvg.call(zoomBehavior);

  const initialTransform = vizState.zoomTransform || window.d3.zoomIdentity;
  zoomLayer.attr('transform', initialTransform.toString());
  treeSvg.call(zoomBehavior.transform, initialTransform);
  applyTreeZoomStyles(initialTransform);

  const cluster = d3.cluster().size([height, width]);
  cluster(root);

  const descendants = root.descendants();
  const leafIdSet = new Set(root.leaves().map((leaf) => leaf.data.id));
  const nodeIndex = new Map();
  descendants.forEach((node) => {
    if (node?.data?.id) {
      nodeIndex.set(node.data.id, node);
    }
  });
  treeRenderState.nodes = descendants;
  treeRenderState.leafIdSet = leafIdSet;
  treeRenderState.nodeIndex = nodeIndex;

  const layoutMode = vizState.layout || 'time';
  let axisLabel = 'Calendar year (approx.)';
  let xScale;

  if (layoutMode === 'cladogram') {
    const maxDepth = d3.max(root.descendants(), (d) => d.depth) || 1;
    xScale = d3.scaleLinear().domain([0, maxDepth]).range([0, width]);
    root.each((d) => {
      d.y = xScale(d.depth);
    });
    axisLabel = 'Tree depth (cladogram)';
  } else {
    const referenceDate = vizState.latestDate || new Date();
    const referenceYear = referenceDate.getFullYear()
      + (referenceDate.getMonth() + 1) / 12
      + referenceDate.getDate() / 365.25;
    const timeValues = root.descendants().map((d) => referenceYear - d.data.time_before_present);
    let [minYear, maxYear] = d3.extent(timeValues);
    if (!Number.isFinite(minYear) || !Number.isFinite(maxYear)) {
      minYear = referenceYear - 10;
      maxYear = referenceYear;
    }
    if (minYear === maxYear) {
      maxYear = minYear + 1;
    }
    xScale = d3.scaleLinear()
      .domain([minYear, maxYear])
      .nice()
      .range([0, width]);

    root.each((d) => {
      d.y = xScale(referenceYear - d.data.time_before_present);
    });

    treeRenderState.timelineGridLines = drawTimelineGrid(g, xScale, height);
    axisLabel = `Calendar year (latest ${formatDateLabel(referenceDate)})`;
  }

  const nodeData = descendants.map((d) => d.data);
  traitStatsCache = traitStatsCache || analyzeTraits(nodeData);
  const colorConfig = buildColorScale(nodeData, vizState.colorTrait || 'auto', vizState.colorDirection);
  colorState.trait = colorConfig.trait;
  colorState.scale = colorConfig.scale;
  colorState.type = colorConfig.type;
  colorState.traitInfo = colorConfig.info;
  colorState.domain = colorConfig.domain;
  colorState.label = colorConfig.label;

  if (colorDirectionSelect) {
    colorDirectionSelect.disabled = colorConfig.type !== 'numeric';
    if (colorConfig.type !== 'numeric') {
      if (vizState.colorDirection !== 'increasing') {
        vizState.colorDirection = 'increasing';
      }
      colorDirectionSelect.value = 'increasing';
    } else {
      colorDirectionSelect.value = vizState.colorDirection;
    }
  }

  const linkData = root.links().map((link) => ({
    source: link.source,
    target: link.target,
    points: [
      [link.source.y, link.source.x],
      [link.source.y, link.target.x],
      [link.target.y, link.target.x],
    ],
  }));

  const branchPath = d3.line()
    .x((d) => d[0])
    .y((d) => d[1]);

  const branchSelection = g.append('g')
    .attr('fill', 'none')
    .attr('stroke', '#cbd5f5')
    .attr('stroke-width', 1.3)
    .attr('stroke-linejoin', 'round')
    .attr('stroke-linecap', 'round')
    .selectAll('path')
    .data(linkData, (d) => `${d.source.data.id}-${d.target.data.id}`)
    .join('path')
    .attr('class', 'branch')
    .attr('d', (d) => branchPath(d.points))
    .attr('opacity', 0.85);

  const nodeGroup = g.append('g')
    .selectAll('g')
    .data(descendants)
    .join('g')
    .attr('transform', (d) => `translate(${d.y},${d.x})`);

  const nodeRadius = vizState.nodeRadius;
  const leafNodes = nodeGroup.filter((d) => !d.children)
    .classed('tree-node', true)
    .style('cursor', 'pointer')
    .on('click', (event, d) => {
      event.stopPropagation();
      toggleNodeSelection(d.data.id, event.shiftKey || event.metaKey || event.ctrlKey);
    });

  const leafCircles = leafNodes.append('circle')
    .attr('r', nodeRadius)
    .attr('fill', (d) => colorConfig.getColor(d.data))
    .attr('stroke', '#0f172a')
    .attr('stroke-width', 0.6)
    .attr('opacity', 0.98);

  let leafLabels = null;
  if (vizState.showLabels) {
    leafLabels = leafNodes.append('text')
      .text((d) => d.data.label || d.data.id)
      .attr('dy', '0.32em')
      .attr('x', nodeRadius + 6)
      .attr('text-anchor', 'start')
      .attr('font-size', 11)
      .attr('fill', '#1f2937')
      .attr('opacity', 0.9);
  }

  treeRenderState.nodes = root.descendants();
  treeRenderState.nodeGroups = leafNodes;
  treeRenderState.leafCircles = leafCircles;
  treeRenderState.leafLabels = leafLabels;
  treeRenderState.branchSelection = branchSelection;

  nodeGroup.append('title')
    .text((d) => {
      const label = d.data.label || d.data.id;
      const time = Number.isFinite(d.data.time_before_present)
        ? `Time before present: ${formatNumber(d.data.time_before_present)}`
        : '';
      let traitInfo = '';
      if (colorState.trait && colorState.traitInfo) {
        const raw = getTraitRawValue(d.data, colorState.trait, colorState.traitInfo);
        traitInfo = `${colorState.label || colorState.trait}: ${formatTraitValue(raw, colorState.traitInfo)}`;
      }
      return [label, time, traitInfo].filter(Boolean).join('\n');
    });

  const axis = d3.axisBottom(xScale)
    .ticks(Math.min(12, Math.max(4, Math.floor(width / 140))))
    .tickFormat((d) => `${d}`);

  g.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(axis)
    .call((gAxis) => gAxis.append('text')
      .attr('x', width)
      .attr('y', 36)
      .attr('fill', '#1f2933')
      .attr('font-weight', 600)
      .attr('text-anchor', 'end')
      .text(axisLabel));

  drawLegend(treeSvg, colorConfig, viewWidth, margin.top);
  treeRenderState.margin = { ...margin };
  treeRenderState.layoutSize = { width, height };
  setupTreeBrush(margin, width, height);
  applySelectionStyles();
  updateMapSelection();
  refreshMigrationLayer();
  applyTreeZoomStyles();
  treeSvg.on('click.node-select', () => {
    if (!brushState.enabled) {
      clearNodeSelection();
    }
  });
  updateSelectionDetails();
}

function setMapStatus(message = '', isError = false) {
  if (!mapStatusEl) {
    return;
  }
  mapStatusEl.textContent = message;
  if (!message) {
    mapStatusEl.style.color = '';
    return;
  }
  mapStatusEl.style.color = isError ? '#b91c1c' : '#1b4965';
}

function setMigrationMatrixStatus(message = '', isError = false) {
  if (!migrationMatrixStatusEl) {
    return;
  }
  migrationMatrixStatusEl.textContent = message;
  if (!message) {
    migrationMatrixStatusEl.style.color = '';
    return;
  }
  migrationMatrixStatusEl.style.color = isError ? '#b91c1c' : '#1b4965';
}

function isValidTileTemplate(url) {
  if (typeof url !== 'string') {
    return false;
  }
  const hasZ = /\{z\}/i.test(url);
  const hasX = /\{x\}/i.test(url);
  const hasY = /\{y\}/i.test(url);
  return hasZ && hasX && hasY;
}

function normalizeMapConfig(rawConfig) {
  if (!rawConfig || (typeof rawConfig !== 'object' && typeof rawConfig !== 'string')) {
    throw new Error('Map config must be an object or a tile URL.');
  }

  if (typeof rawConfig === 'string') {
    return normalizeMapConfig({ tileUrl: rawConfig });
  }

  let tileUrl = '';
  if (typeof rawConfig.tileUrl === 'string') {
    tileUrl = rawConfig.tileUrl.trim();
  } else if (typeof rawConfig.url === 'string') {
    tileUrl = rawConfig.url.trim();
  }

  if (!tileUrl) {
    throw new Error('The map config is missing a tileUrl property.');
  }

  const options = { ...defaultTileOptions };
  if (rawConfig.options && typeof rawConfig.options === 'object') {
    Object.assign(options, rawConfig.options);
  }

  const passthroughKeys = [
    'attribution',
    'maxZoom',
    'minZoom',
    'noWrap',
    'tms',
    'subdomains',
    'detectRetina',
    'tileSize',
    'zoomOffset',
    'bounds',
    'updateWhenIdle',
    'updateWhenZooming',
  ];

  passthroughKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(rawConfig, key)) {
      options[key] = rawConfig[key];
    }
  });

  const mapName = typeof rawConfig.name === 'string' && rawConfig.name.trim()
    ? rawConfig.name.trim()
    : 'Custom map';

  return {
    tileUrl,
    options,
    name: mapName,
  };
}

function createTileLayerFromConfig(config) {
  if (!ensureLeaflet()) {
    throw new Error('Leaflet is not available.');
  }
  return L.tileLayer(config.tileUrl, config.options || {});
}

function applyBaseMap(rawConfig) {
  const mapInstance = ensureMap();
  if (!mapInstance) {
    throw new Error('Map is not ready.');
  }
  const config = normalizeMapConfig(rawConfig);
  if (!isValidTileTemplate(config.tileUrl)) {
    throw new Error('Tile URL must include {z}, {x}, and {y} placeholders.');
  }
  const newLayer = createTileLayerFromConfig(config);
  if (baseTileLayer) {
    mapInstance.removeLayer(baseTileLayer);
  }
  baseTileLayer = newLayer.addTo(mapInstance);
  if (typeof baseTileLayer.bringToBack === 'function') {
    baseTileLayer.bringToBack();
  }
  currentMapConfig = config;
  return config;
}

function ensureMap() {
  if (!ensureLeaflet()) {
    return null;
  }
  if (!leafletMap) {
    leafletMap = L.map('map', { worldCopyJump: true }).setView([0, 0], 2);
    const normalizedDefault = normalizeMapConfig(defaultMapConfig);
    baseTileLayer = createTileLayerFromConfig(normalizedDefault).addTo(leafletMap);
    if (typeof baseTileLayer.bringToBack === 'function') {
      baseTileLayer.bringToBack();
    }
    currentMapConfig = normalizedDefault;
    const hpdPane = leafletMap.createPane('hpdPane');
    hpdPane.style.zIndex = '450';
    hpdPane.style.pointerEvents = 'none';
    geoLayerGroup = L.layerGroup().addTo(leafletMap);
    mapRenderState.hpdLayerGroup = L.layerGroup().addTo(leafletMap);
    animationLayerGroup = L.layerGroup().addTo(leafletMap);
    selectionLayerGroup = L.layerGroup().addTo(leafletMap);
    return leafletMap;
  }

  if (!leafletMap.getPane('hpdPane')) {
    const pane = leafletMap.createPane('hpdPane');
    pane.style.zIndex = '450';
    pane.style.pointerEvents = 'none';
  }

  if (baseTileLayer && !leafletMap.hasLayer(baseTileLayer)) {
    baseTileLayer.addTo(leafletMap);
    if (typeof baseTileLayer.bringToBack === 'function') {
      baseTileLayer.bringToBack();
    }
  }

  if (!geoLayerGroup) {
    geoLayerGroup = L.layerGroup().addTo(leafletMap);
  } else {
    geoLayerGroup.addTo(leafletMap);
  }
  if (!mapRenderState.hpdLayerGroup) {
    mapRenderState.hpdLayerGroup = L.layerGroup().addTo(leafletMap);
  } else {
    mapRenderState.hpdLayerGroup.addTo(leafletMap);
  }
  if (!animationLayerGroup) {
    animationLayerGroup = L.layerGroup().addTo(leafletMap);
  } else {
    animationLayerGroup.addTo(leafletMap);
  }
  if (!selectionLayerGroup) {
    selectionLayerGroup = L.layerGroup().addTo(leafletMap);
  } else {
    selectionLayerGroup.addTo(leafletMap);
  }

  return leafletMap;
}

function extractCoordinates(node) {
  const latKeys = ['location_lat', 'latitude', 'lat', 'location1'];
  const lonKeys = ['location_lon', 'longitude', 'lon', 'long', 'location2'];
  let lat;
  let lon;
  for (const key of latKeys) {
    if (key in node.traits && typeof node.traits[key] === 'number') {
      lat = node.traits[key];
      break;
    }
  }
  for (const key of lonKeys) {
    if (key in node.traits && typeof node.traits[key] === 'number') {
      lon = node.traits[key];
      break;
    }
  }
  if (typeof lat === 'number' && typeof lon === 'number' && !Number.isNaN(lat) && !Number.isNaN(lon)) {
    return [lat, lon];
  }
  return null;
}

function toNumericArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const numeric = [];
  value.forEach((entry) => {
    const num = Number(entry);
    if (Number.isFinite(num)) {
      numeric.push(num);
    }
  });
  return numeric;
}

function extractLocationHpdPolygons(node) {
  const polygons = [];
  if (!node || !node.traits) {
    return polygons;
  }
  const latBuckets = new Map();
  const lonBuckets = new Map();

  Object.entries(node.traits).forEach(([key, rawValue]) => {
    const match = /^location([12])_80%HPD_(\d+)$/.exec(key);
    if (!match) {
      return;
    }
    const axis = match[1];
    const bucketKey = match[2];
    const numericValues = toNumericArray(rawValue);
    if (!numericValues.length) {
      return;
    }
    if (axis === '1') {
      latBuckets.set(bucketKey, numericValues);
    } else if (axis === '2') {
      lonBuckets.set(bucketKey, numericValues);
    }
  });

  latBuckets.forEach((latList, bucketKey) => {
    const lonList = lonBuckets.get(bucketKey);
    if (!lonList || latList.length !== lonList.length || latList.length < 3) {
      return;
    }
    const coords = [];
    for (let i = 0; i < latList.length; i += 1) {
      const lat = latList[i];
      const lon = lonList[i];
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        coords.push([lat, lon]);
      }
    }
    if (coords.length < 3) {
      return;
    }
    const [firstLat, firstLon] = coords[0];
    const [lastLat, lastLon] = coords[coords.length - 1];
    if (Math.abs(firstLat - lastLat) > 1e-6 || Math.abs(firstLon - lastLon) > 1e-6) {
      coords.push([firstLat, firstLon]);
    }
    polygons.push(coords);
  });

  return polygons;
}

function buildNodePopup(node, approxYear = null) {
  const details = [];
  const label = node.label || node.id || 'Unknown';
  details.push(`<strong>${label}</strong>`);
  if (Number.isFinite(node.time_before_present)) {
    details.push(`Time before present: ${formatNumber(node.time_before_present)}`);
  }
  if (Number.isFinite(approxYear)) {
    details.push(`Approximate year: ${approxYear.toFixed(2)}`);
  }

  const traits = [];
  if (node.traits && typeof node.traits === 'object') {
    const keys = metadataState.metadataTraits instanceof Set
      ? Array.from(metadataState.metadataTraits)
      : [];
    keys.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(node.traits, key)) {
        return;
      }
      const rawValue = node.traits[key];
      let value;
      if (Array.isArray(rawValue)) {
        value = rawValue.join(', ');
      } else if (rawValue === null || rawValue === undefined) {
        value = '';
      } else {
        value = `${rawValue}`;
      }
      traits.push({ label: getTraitDisplayName(key), value });
    });
  }

  let html = details.join('<br/>');
  if (traits.length) {
    const rows = traits.map((trait) => `
      <div class="trait-row">
        <span class="trait-label">${trait.label}</span>
        <span class="trait-value">${trait.value}</span>
      </div>`).join('');
    html += `<div class="popup-traits">${rows}</div>`;
  }
  return html;
}

function renderMap(payload) {
  const mapInstance = ensureMap();
  if (!mapInstance || !ensureLeaflet() || !geoLayerGroup) {
    return;
  }
  geoLayerGroup.clearLayers();
  if (animationLayerGroup) {
    animationLayerGroup.clearLayers();
  }
  if (selectionLayerGroup) {
    selectionLayerGroup.clearLayers();
  }
  if (mapRenderState.hpdLayerGroup) {
    mapRenderState.hpdLayerGroup.clearLayers();
  }

  nodeCoordinateCache = new Map();
  mapRenderState.markers = new Map();
  mapRenderState.markerMeta = new Map();
  mapRenderState.edgeLayers = [];
  mapRenderState.nodeById = new Map();
  mapRenderState.hpdByNode = new Map();
  mapRenderState.displayedNodeIds = new Set();

  const coords = [];
  const nodePoints = [];
  const leafSet = treeRenderState.leafIdSet || new Set();

  payload.nodes.forEach((node) => {
    mapRenderState.nodeById.set(node.id, node);
    const hpdPolygons = extractLocationHpdPolygons(node);
    if (hpdPolygons.length) {
      mapRenderState.hpdByNode.set(node.id, hpdPolygons);
    }
    const point = extractCoordinates(node);
    if (!point) {
      return;
    }
    nodeCoordinateCache.set(node.id, point);
    coords.push(point);
    nodePoints.push({ node, point });
  });

  prepareMigrationEvents(payload);

  nodePoints.forEach(({ node, point }) => {
    const isLeaf = leafSet.has(node.id);
    const markerRadius = Math.max(isLeaf ? vizState.nodeRadius + 1 : vizState.nodeRadius + 2, isLeaf ? 3 : 5);
    const nodeColor = isLeaf ? getNodeColor(node) : '#0f172a';
    const baseStyle = {
      radius: markerRadius,
      color: nodeColor,
      weight: isLeaf ? 1 : 1.4,
      fillColor: isLeaf ? nodeColor : '#ffffff',
      fillOpacity: isLeaf ? 0.85 : 0.15,
      opacity: 0.9,
      dashArray: isLeaf ? null : '4 4',
    };
    const marker = L.circleMarker(point, baseStyle);
    const label = node.label ? `<strong>${node.label}</strong>` : `<strong>${node.id}</strong>`;
    const time = Number.isFinite(node.time_before_present) ? node.time_before_present.toFixed(2) : null;
    const approxYear = animationState.referenceYear && Number.isFinite(node.time_before_present)
      ? animationState.referenceYear - node.time_before_present
      : null;
    const popup = buildNodePopup(node, approxYear);
    const fallback = time !== null ? `${label}<br/>Time before present: ${time}` : label;
    marker.bindPopup(popup || fallback);
    geoLayerGroup.addLayer(marker);
    mapRenderState.markers.set(node.id, marker);
    mapRenderState.markerMeta.set(node.id, {
      baseStyle,
      isLeaf,
      node,
    });
  });

  payload.edges.forEach((edge) => {
    const parentCoord = nodeCoordinateCache.get(edge.parent_id);
    const childCoord = nodeCoordinateCache.get(edge.child_id);
    if (parentCoord && childCoord) {
      const baseStyle = {
        color: '#334155',
        weight: 1,
        opacity: 0.25,
      };
      const polyline = L.polyline([parentCoord, childCoord], baseStyle);
      geoLayerGroup.addLayer(polyline);
      mapRenderState.edgeLayers.push({
        layer: polyline,
        parentId: edge.parent_id,
        childId: edge.child_id,
        baseStyle,
      });
    }
  });

  if (coords.length) {
    const bounds = L.latLngBounds(coords.map((c) => L.latLng(c[0], c[1])));
    mapInstance.fitBounds(bounds, { padding: [20, 20] });
  } else {
    mapInstance.setView([0, 0], 2);
  }
  refreshMigrationLayer();
  updateTimelineControlsAvailability();
  updateMapSelection();
  updateBaseMarkerVisibility();
}

function renderTraits(payload) {
  traitSummaryCache = summarizeTraits(payload.nodes);
  updateTraitSummary();
}

function renderMigrationMatrixTable(matrixPayload) {
  if (!migrationMatrixTable) {
    return;
  }
  const thead = migrationMatrixTable.querySelector('thead');
  const tbody = migrationMatrixTable.querySelector('tbody');
  if (!thead || !tbody) {
    return;
  }
  thead.textContent = '';
  tbody.textContent = '';

  const sources = Array.isArray(matrixPayload?.sources) ? matrixPayload.sources : [];
  const targets = Array.isArray(matrixPayload?.targets) ? matrixPayload.targets : [];
  const counts = Array.isArray(matrixPayload?.counts) ? matrixPayload.counts : [];

  if (!sources.length || !targets.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = Math.max(2, targets.length + 1);
    cell.textContent = 'No migration events available.';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  const headerRow = document.createElement('tr');
  const corner = document.createElement('th');
  corner.textContent = 'Source \\ Target';
  corner.scope = 'col';
  headerRow.appendChild(corner);
  targets.forEach((target) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = target;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  sources.forEach((source, sourceIndex) => {
    const tr = document.createElement('tr');
    const labelCell = document.createElement('th');
    labelCell.scope = 'row';
    labelCell.textContent = source;
    tr.appendChild(labelCell);
    const rowCounts = Array.isArray(counts[sourceIndex]) ? counts[sourceIndex] : [];
    targets.forEach((target, targetIndex) => {
      const td = document.createElement('td');
      const value = Number(rowCounts[targetIndex]) || 0;
      td.textContent = value.toString();
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function downloadTreeSVG() {
  if (!treeSvgElement) {
    setStatus('Tree SVG not available.');
    return;
  }
  const serializer = new XMLSerializer();
  const cloned = treeSvgElement.cloneNode(true);
  cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  cloned.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  const svgString = serializer.serializeToString(cloned);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, 'tree.svg');
}

function buildMapGeoJSON(payload) {
  const features = [];
  const coordinateLookup = new Map();

  payload.nodes.forEach((node) => {
    const point = extractCoordinates(node);
    if (!point) {
      return;
    }
    coordinateLookup.set(node.id, point);
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [point[1], point[0]],
      },
      properties: {
        id: node.id,
        label: node.label || null,
        time_from_root: node.time_from_root,
        time_before_present: node.time_before_present,
        traits: node.traits || {},
      },
    });
  });

  payload.edges.forEach((edge) => {
    const parent = coordinateLookup.get(edge.parent_id);
    const child = coordinateLookup.get(edge.child_id);
    if (!parent || !child) {
      return;
    }
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [parent[1], parent[0]],
          [child[1], child[0]],
        ],
      },
      properties: {
        parent: edge.parent_id,
        child: edge.child_id,
      },
    });
  });

  return {
    type: 'FeatureCollection',
    features,
  };
}

function downloadMapGeoJSON() {
  if (!cachedPayload) {
    setStatus('No tree loaded to export map data.');
    return;
  }
  const geojson = buildMapGeoJSON(cachedPayload);
  const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json;charset=utf-8' });
  downloadBlob(blob, 'map-trajectories.geojson');
}

function downloadMapImage() {
  if (!leafletMap) {
    setStatus('Map is not available to export.');
    return;
  }
  try {
    leafletMap.once('idle', () => {
      leafletMap.invalidateSize();
    });
    const container = leafletMap.getContainer();
    if (!window.html2canvas) {
      setStatus('html2canvas is required to export map images.');
      return;
    }
    html2canvas(container).then((canvas) => {
      canvas.toBlob((blob) => {
        if (blob) {
          downloadBlob(blob, 'map.png');
        }
      }, 'image/png');
    });
  } catch (error) {
    console.error(error);
    setStatus('Failed to render map image.');
  }
}

function normalizeMetadataKey(value) {
  if (value === null || value === undefined) {
    return '';
  }
  let key = `${value}`.trim();
  if (!key) {
    return '';
  }
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  return key.trim().toLowerCase();
}

function standardizeTraitKey(key) {
  if (!key) {
    return '';
  }
  const normalized = `${key}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || `${key}`.trim();
}

function detectDelimiter(line) {
  const tabCount = (line.match(/\t/g) || []).length;
  const commaCount = (line.match(/,/g) || []).length;
  const semicolonCount = (line.match(/;/g) || []).length;
  if (tabCount >= commaCount && tabCount >= semicolonCount && tabCount > 0) {
    return '\t';
  }
  if (commaCount >= semicolonCount && commaCount > 0) {
    return ',';
  }
  if (semicolonCount > 0) {
    return ';';
  }
  return ',';
}

function parseDelimitedRow(row, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i += 1) {
    const char = row[i];
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map((cell) => {
    let cleaned = cell.trim();
    if ((cleaned.startsWith('"') && cleaned.endsWith('"'))
      || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
      cleaned = cleaned.slice(1, -1);
    }
    return cleaned.replace(/""/g, '"').trim();
  });
}

function detectIdentifierColumn(headers) {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  const candidates = ['id', 'name', 'sample', 'sample_id', 'taxon', 'tip', 'strain', 'label', 'sequence'];
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate);
    if (idx !== -1) {
      return idx;
    }
  }
  return 0;
}

function coerceMetadataValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = `${value}`.trim();
  if (!trimmed) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'true' || lower === 'false') {
    return lower === 'true';
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
  }
  return trimmed;
}

async function parseMetadataFile(file) {
  const rawText = await file.text();
  const lines = rawText.replace(/\r\n/g, '\n').split('\n').filter((line) => line.trim().length > 0);
  if (!lines.length) {
    throw new Error('Metadata file is empty.');
  }
  const delimiter = detectDelimiter(lines[0]);
  const headers = parseDelimitedRow(lines[0], delimiter).filter((header) => header.length > 0);
  if (!headers.length) {
    throw new Error('Metadata file is missing a header row.');
  }
  const idIndex = detectIdentifierColumn(headers);
  const dataColumns = headers.filter((_, idx) => idx !== idIndex);
  if (!dataColumns.length) {
    throw new Error('Metadata file must contain additional columns beyond the identifier column.');
  }

  const records = new Map();
  const columnKeyMap = new Map();
  const usedKeys = new Set();

  dataColumns.forEach((column) => {
    let traitKey = standardizeTraitKey(column);
    if (!traitKey) {
      traitKey = `trait_${usedKeys.size + 1}`;
    }
    while (usedKeys.has(traitKey)) {
      traitKey = `${traitKey}_${usedKeys.size + 1}`;
    }
    usedKeys.add(traitKey);
    columnKeyMap.set(column, traitKey);
  });

  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseDelimitedRow(lines[i], delimiter);
    if (!cells.length) {
      continue;
    }
    while (cells.length < headers.length) {
      cells.push('');
    }
    const identifier = normalizeMetadataKey(cells[idIndex] || '');
    if (!identifier) {
      continue;
    }
    const entry = {};
    headers.forEach((header, idx) => {
      if (idx === idIndex) {
        return;
      }
      entry[header] = coerceMetadataValue(idx < cells.length ? cells[idx] : null);
    });
    records.set(identifier, entry);
  }

  if (!records.size) {
    throw new Error('Metadata file did not contain any usable rows.');
  }

  return {
    records,
    columns: dataColumns,
    idField: headers[idIndex],
    columnKeyMap,
  };
}

function clearExternalMetadata(payload) {
  if (!payload || !Array.isArray(metadataState.appliedColumns) || !metadataState.appliedColumns.length) {
    metadataState.appliedColumns = [];
    return;
  }
  payload.nodes.forEach((node) => {
    if (!node || !node.traits) {
      return;
    }
    metadataState.appliedColumns.forEach((column) => {
      if (Object.prototype.hasOwnProperty.call(node.traits, column)) {
        delete node.traits[column];
      }
    });
  });
  metadataState.appliedColumns = [];
}

function findMetadataEntry(node) {
  if (!node || !metadataState.records.size) {
    return null;
  }
  const candidates = [];
  if (node.label) {
    candidates.push(node.label);
    candidates.push(node.label.replace(/["']/g, ''));
  }
  if (node.id) {
    candidates.push(node.id);
  }
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const key = normalizeMetadataKey(candidate);
    if (metadataState.records.has(key)) {
      return metadataState.records.get(key);
    }
  }
  return null;
}

function applyMetadataToNodes(payload) {
  if (!payload || !metadataState.records.size || !metadataState.columns.length) {
    metadataState.appliedColumns = [];
    return { matched: 0, columns: [] };
  }

  clearExternalMetadata(payload);

  const appliedColumns = new Set();
  let matched = 0;

  if (!(metadataState.metadataTraits instanceof Set)) {
    metadataState.metadataTraits = new Set();
  } else {
    metadataState.metadataTraits.clear();
  }

  if (!(metadataState.columnDisplayNames instanceof Map)) {
    metadataState.columnDisplayNames = new Map();
  }

  payload.nodes.forEach((node) => {
    const entry = findMetadataEntry(node);
    if (!entry) {
      return;
    }
    if (!node.traits || typeof node.traits !== 'object') {
      node.traits = {};
    }
    let matchedNode = false;
    metadataState.columns.forEach((column) => {
      const traitKey = metadataState.columnKeyMap.get(column)
        || standardizeTraitKey(column)
        || column;
      const value = Object.prototype.hasOwnProperty.call(entry, column) ? entry[column] : null;
      if (value === null || value === undefined || value === '') {
        return;
      }
      node.traits[traitKey] = value;
      appliedColumns.add(traitKey);
      metadataState.metadataTraits.add(traitKey);
      metadataState.columnDisplayNames.set(traitKey, column);
      matchedNode = true;
    });
    if (matchedNode) {
      matched += 1;
    }
  });

  const columns = Array.from(appliedColumns);
  metadataState.appliedColumns = columns;
  return { matched, columns };
}

function setSidebarVisibility(hidden) {
  if (!workspace || !sidebar) {
    return;
  }
  if (hidden) {
    workspace.classList.add('sidebar-collapsed');
    sidebar.classList.add('hidden');
    if (sidebarHandleBtn) {
      sidebarHandleBtn.classList.add('is-visible');
      sidebarHandleBtn.setAttribute('aria-expanded', 'false');
    }
    if (toggleSidebarBtn) {
      toggleSidebarBtn.textContent = 'Show Controls';
    }
  } else {
    workspace.classList.remove('sidebar-collapsed');
    sidebar.classList.remove('hidden');
    if (sidebarHandleBtn) {
      sidebarHandleBtn.classList.remove('is-visible');
      sidebarHandleBtn.setAttribute('aria-expanded', 'true');
    }
    if (toggleSidebarBtn) {
      toggleSidebarBtn.textContent = 'Hide Controls';
    }
    if (leafletMap) {
      setTimeout(() => {
        leafletMap.invalidateSize();
      }, 200);
    }
  }
}

function applySelectionStyles() {
  if (treeRenderState.nodeGroups) {
    treeRenderState.nodeGroups.classed('selected', (d) => selectionState.nodeIds.has(d.data.id));
  }
  if (treeRenderState.branchSelection) {
    treeRenderState.branchSelection.classed('selected', (d) => selectionState.nodeIds.has(d.source.data.id)
      && selectionState.nodeIds.has(d.target.data.id));
  }
}

function resetTreeView() {
  if (!treeSvg || !zoomBehavior || !window.d3) {
    return;
  }
  const identity = window.d3.zoomIdentity;
  vizState.zoomTransform = identity;
  treeSvg.transition().duration(400).call(zoomBehavior.transform, identity);
}

function resetMapViewport() {
  const mapInstance = ensureMap();
  if (!mapInstance || !ensureLeaflet()) {
    return;
  }
  const coords = [];
  if (nodeCoordinateCache instanceof Map) {
    nodeCoordinateCache.forEach((coord) => {
      if (Array.isArray(coord)
        && coord.length === 2
        && Number.isFinite(coord[0])
        && Number.isFinite(coord[1])) {
        coords.push(coord);
      }
    });
  }
  if (coords.length && window.L && typeof window.L.latLngBounds === 'function') {
    const bounds = window.L.latLngBounds(coords.map(([lat, lon]) => window.L.latLng(lat, lon)));
    mapInstance.fitBounds(bounds, { padding: [20, 20] });
    return;
  }
  mapInstance.setView([0, 0], 2);
}

function toggleNodeSelection(nodeId, additive = false) {
  if (!nodeId) {
    return;
  }
  if (!additive) {
    if (selectionState.nodeIds.size === 1 && selectionState.nodeIds.has(nodeId)) {
      selectionState.nodeIds.clear();
    } else {
      selectionState.nodeIds.clear();
      selectionState.nodeIds.add(nodeId);
    }
    brushState.selectedIds.clear();
  } else if (selectionState.nodeIds.has(nodeId)) {
    selectionState.nodeIds.delete(nodeId);
  } else {
    selectionState.nodeIds.add(nodeId);
  }
  applySelectionStyles();
  updateMapSelection();
  refreshMigrationLayer();
  updateSelectionDetails();
}

function clearNodeSelection() {
  if (!selectionState.nodeIds.size) {
    return;
  }
  selectionState.nodeIds.clear();
  brushState.selectedIds.clear();
  applySelectionStyles();
  updateMapSelection();
  refreshMigrationLayer();
  updateSelectionDetails();
}

function setupTreeBrush(margin, width, height) {
  if (!ensureD3() || !treeSvg) {
    return;
  }
  if (treeRenderState.brushLayer) {
    treeRenderState.brushLayer.remove();
    treeRenderState.brushLayer = null;
    treeRenderState.brush = null;
  }
  treeRenderState.margin = { ...margin };
  if (!brushState.enabled) {
    return;
  }
  const d3 = window.d3;
  const brush = d3.brush()
    .extent([[margin.left, margin.top], [margin.left + width, margin.top + height]])
    .on('start brush', handleTreeBrush)
    .on('end', handleTreeBrush);

  const brushLayer = treeSvg.append('g')
    .attr('class', 'tree-brush-layer');
  brushLayer.call(brush);
  brushLayer.selectAll('.overlay').attr('cursor', 'crosshair');

  treeRenderState.brush = brush;
  treeRenderState.brushLayer = brushLayer;
}

function handleTreeBrush(event) {
  if (!brushState.enabled || !treeRenderState.brush || !treeRenderState.brushLayer) {
    return;
  }
  if (!event.selection) {
    if (event.type === 'end' && event.sourceEvent) {
      brushState.selectedIds.clear();
      selectionState.nodeIds.clear();
      applySelectionStyles();
      updateMapSelection();
      refreshMigrationLayer();
      updateSelectionDetails();
    }
    return;
  }

  const [[x0, y0], [x1, y1]] = event.selection;
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const transform = getCurrentTransform();
  const margin = treeRenderState.margin || { left: 0, top: 0 };

  const selectedIds = new Set();

  treeRenderState.nodes.forEach((node) => {
    const px = transform.applyX(node.y + margin.left);
    const py = transform.applyY(node.x + margin.top);
    if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
      const identifier = node?.data?.id;
      if (identifier) {
        selectedIds.add(identifier);
      }
    }
  });

  const filteredIds = restrictSelectionToBranch(selectedIds);
  brushState.selectedIds = filteredIds;
  selectionState.nodeIds.clear();
  filteredIds.forEach((id) => selectionState.nodeIds.add(id));
  applySelectionStyles();
  updateMapSelection();
  refreshMigrationLayer();

  if (event.type === 'end') {
    updateSelectionDetails();
    treeRenderState.brushLayer.call(treeRenderState.brush.move, null);
  }
}

function restrictSelectionToBranch(selectedIds) {
  if (!(selectedIds instanceof Set) || !selectedIds.size) {
    return selectedIds;
  }
  const nodeIndex = treeRenderState.nodeIndex instanceof Map ? treeRenderState.nodeIndex : null;
  if (!nodeIndex || !nodeIndex.size) {
    return selectedIds;
  }
  const leafSet = treeRenderState.leafIdSet instanceof Set ? treeRenderState.leafIdSet : null;
  const selectedNodes = [];
  const leafNodes = [];
  selectedIds.forEach((id) => {
    const node = nodeIndex.get(id);
    if (!node) {
      return;
    }
    selectedNodes.push(node);
    if (!leafSet || !leafSet.size || leafSet.has(id)) {
      leafNodes.push(node);
    }
  });
  if (!leafNodes.length) {
    return selectedIds;
  }
  let branchRoot = leafNodes[0];
  for (let i = 1; i < leafNodes.length; i += 1) {
    branchRoot = findLowestCommonAncestor(branchRoot, leafNodes[i]) || branchRoot;
  }
  if (!branchRoot) {
    return selectedIds;
  }
  const filtered = new Set();
  const addPathToRoot = (node) => {
    let current = node;
    while (current) {
      filtered.add(current.data.id);
      if (current === branchRoot) {
        break;
      }
      current = current.parent;
    }
  };
  leafNodes.forEach(addPathToRoot);
  selectedNodes.forEach((node) => {
    if (isDescendantOf(node, branchRoot)) {
      filtered.add(node.data.id);
    }
  });
  return filtered;
}

function findLowestCommonAncestor(nodeA, nodeB) {
  if (!nodeA || !nodeB) {
    return null;
  }
  const ancestors = new Set();
  let current = nodeA;
  while (current) {
    ancestors.add(current);
    current = current.parent;
  }
  current = nodeB;
  while (current) {
    if (ancestors.has(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function isDescendantOf(node, ancestor) {
  if (!node || !ancestor) {
    return false;
  }
  let current = node;
  while (current) {
    if (current === ancestor) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function updateMapSelection() {
  if (!selectionLayerGroup) {
    return;
  }
  selectionLayerGroup.clearLayers();
  if (!cachedPayload || !selectionState.nodeIds.size) {
    updateBaseMarkerVisibility();
    return;
  }
  const highlightColor = '#be123c';
  const nodesById = new Map(cachedPayload.nodes.map((node) => [node.id, node]));
  const leafSet = treeRenderState.leafIdSet || new Set();
  selectionState.nodeIds.forEach((id) => {
    const coord = nodeCoordinateCache.get(id);
    if (!coord) {
      return;
    }
    const node = nodesById.get(id);
    const isLeaf = leafSet.has(id);
    const marker = L.circleMarker(coord, {
      radius: Math.max(isLeaf ? vizState.nodeRadius + 2.5 : vizState.nodeRadius + 3.5, isLeaf ? 6.5 : 7.5),
      color: highlightColor,
      weight: isLeaf ? 2 : 1.8,
      opacity: 0.9,
      fill: false,
      fillOpacity: 0,
      dashArray: isLeaf ? null : '4 4',
    });
    if (node) {
      const approxYear = animationState.referenceYear && Number.isFinite(node.time_before_present)
        ? animationState.referenceYear - node.time_before_present
        : null;
      const popup = buildNodePopup(node, approxYear);
      if (popup) {
        marker.bindPopup(popup);
      }
    }
    selectionLayerGroup.addLayer(marker);
  });

  cachedPayload.edges.forEach((edge) => {
    if (!selectionState.nodeIds.has(edge.parent_id) || !selectionState.nodeIds.has(edge.child_id)) {
      return;
    }
    const start = nodeCoordinateCache.get(edge.parent_id);
    const end = nodeCoordinateCache.get(edge.child_id);
    if (!start || !end) {
      return;
    }
    selectionLayerGroup.addLayer(L.polyline([start, end], {
      color: highlightColor,
      weight: 3,
      opacity: 0.85,
    }));
  });
  updateBaseMarkerVisibility();
}

function applyMarkerState(marker, style) {
  if (!marker || !style) {
    return;
  }
  const { radius = 0, ...rest } = style;
  marker.setStyle(rest);
  marker.setRadius(Math.max(radius, 0));
}

function updateBaseMarkerVisibility() {
  const hasMarkers = mapRenderState.markerMeta instanceof Map
    && mapRenderState.markerMeta.size > 0;
  if (!hasMarkers) {
    mapRenderState.displayedNodeIds = new Set();
    if (mapRenderState.hpdLayerGroup) {
      mapRenderState.hpdLayerGroup.clearLayers();
    }
    return;
  }
  const hasTimeline = Boolean(animationState.domain)
    && Array.isArray(animationState.nodeAppearances)
    && animationState.nodeAppearances.length > 0;
  const applyFilter = hasTimeline && animationState.useTimelineFilter;
  const appearanceById = animationState.appearanceById instanceof Map ? animationState.appearanceById : null;
  const currentYear = applyFilter && Number.isFinite(animationState.currentYear)
    ? animationState.currentYear
    : null;
  const brushActive = Boolean(brushState.enabled);
  const selectedIds = selectionState.nodeIds instanceof Set ? selectionState.nodeIds : new Set();
  const hasSelection = selectedIds.size > 0;
  const visibleNodeIds = new Set();

  mapRenderState.markerMeta.forEach((meta, id) => {
    const marker = mapRenderState.markers.get(id);
    if (!marker || !meta) {
      return;
    }
    const baseStyle = meta.baseStyle || {};
    const style = { ...baseStyle };
    let visible = true;

    if (brushActive) {
      if (!hasSelection || !selectedIds.has(id)) {
        visible = false;
      }
    }

    if (visible && applyFilter) {
      if (currentYear === null) {
        visible = false;
      } else if (appearanceById && appearanceById.has(id)) {
        const appearance = appearanceById.get(id);
        visible = Number.isFinite(appearance.year) && appearance.year <= (currentYear + 1e-6);
      }
    }

    if (!visible) {
      style.opacity = 0;
      style.fillOpacity = 0;
      style.weight = 0;
      style.radius = 0;
      applyMarkerState(marker, style);
      return;
    }

    style.radius = baseStyle.radius;
    style.weight = baseStyle.weight;
    style.opacity = baseStyle.opacity;
    style.fillOpacity = baseStyle.fillOpacity;
    style.color = baseStyle.color;
    style.fillColor = baseStyle.fillColor;
    style.dashArray = baseStyle.dashArray || null;

    if (meta.isLeaf && meta.node) {
      const currentColor = getNodeColor(meta.node);
      if (currentColor) {
        style.fillColor = currentColor;
        style.color = currentColor;
      }
    }

    if (selectionState.nodeIds.has(id)) {
      style.radius = Math.max((baseStyle.radius || 5) + 1.5, meta.isLeaf ? 5.5 : 6.5);
      style.weight = (baseStyle.weight || 1) + 0.6;
      if (!meta.isLeaf) {
        style.fillOpacity = Math.max(style.fillOpacity || 0, 0.2);
      }
    }

    applyMarkerState(marker, style);
    visibleNodeIds.add(id);
  });

  mapRenderState.displayedNodeIds = visibleNodeIds;
  updateEdgeVisibility({
    applyFilter,
    currentYear,
    appearanceById,
    brushActive,
    hasSelection,
    selectedIds,
    visibleNodeIds,
  });
  refreshHpdOverlay();
}

function updateEdgeVisibility(config) {
  if (!Array.isArray(mapRenderState.edgeLayers)) {
    return;
  }
  const {
    applyFilter,
    currentYear,
    appearanceById,
    brushActive,
    hasSelection,
    selectedIds,
    visibleNodeIds,
  } = config;
  const cutoff = applyFilter && Number.isFinite(currentYear) ? currentYear : null;
  mapRenderState.edgeLayers.forEach((entry) => {
    if (!entry || !entry.layer || !entry.baseStyle) {
      return;
    }
    let visible = true;
    if (brushActive) {
      if (!hasSelection || !selectedIds.has(entry.parentId) || !selectedIds.has(entry.childId)) {
        visible = false;
      }
    }
    if (visible && cutoff !== null && appearanceById instanceof Map) {
      const parentAppearance = appearanceById.get(entry.parentId);
      const childAppearance = appearanceById.get(entry.childId);
      const parentVisible = !parentAppearance
        || !Number.isFinite(parentAppearance.year)
        || parentAppearance.year <= cutoff + 1e-6;
      const childVisible = !childAppearance
        || !Number.isFinite(childAppearance.year)
        || childAppearance.year <= cutoff + 1e-6;
      if (!parentVisible || !childVisible) {
        visible = false;
      }
    }
    if (visible && visibleNodeIds instanceof Set) {
      if (!visibleNodeIds.has(entry.parentId) || !visibleNodeIds.has(entry.childId)) {
        visible = false;
      }
    }
    if (!visible) {
      entry.layer.setStyle({ opacity: 0, weight: 0 });
      return;
    }
    entry.layer.setStyle({
      opacity: entry.baseStyle.opacity,
      weight: entry.baseStyle.weight,
      color: entry.baseStyle.color,
    });
  });
}

function refreshHpdOverlay() {
  const layerGroup = mapRenderState.hpdLayerGroup;
  if (!layerGroup) {
    return;
  }
  layerGroup.clearLayers();
  if (vizState.hpdMode !== 'location80') {
    return;
  }
  const visibleNodeIds = mapRenderState.displayedNodeIds instanceof Set
    ? mapRenderState.displayedNodeIds
    : null;
  if (!visibleNodeIds || !visibleNodeIds.size) {
    return;
  }
  const applyTimeline = Boolean(animationState.domain)
    && animationState.useTimelineFilter
    && Number.isFinite(animationState.currentYear);
  const appearanceById = animationState.appearanceById instanceof Map ? animationState.appearanceById : null;
  const cutoff = applyTimeline ? animationState.currentYear : null;

  const fillColor = vizState.hpdColor || '#f97316';
  visibleNodeIds.forEach((id) => {
    const polygons = mapRenderState.hpdByNode.get(id);
    if (!polygons || !polygons.length) {
      return;
    }
    if (applyTimeline && cutoff !== null && appearanceById && appearanceById.has(id)) {
      const appearance = appearanceById.get(id);
      if (!Number.isFinite(appearance.year) || appearance.year > cutoff + 1e-6) {
        return;
      }
    }
    polygons.forEach((coords) => {
      const polygon = L.polygon(coords, {
        color: fillColor,
        weight: 1,
        opacity: 0.65,
        fillColor,
        fillOpacity: 0.5,
        pane: 'hpdPane',
        interactive: false,
        smoothFactor: 0.5,
      });
      layerGroup.addLayer(polygon);
    });
  });
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] || char));
}

function ensureSelectionInfoViews() {
  if (!selectionInfoEl) {
    return null;
  }
  if (selectionInfoViewState.placeholder && selectionInfoEl.contains(selectionInfoViewState.placeholder)) {
    return selectionInfoViewState;
  }
  selectionInfoEl.textContent = '';
  const placeholder = document.createElement('div');
  placeholder.dataset.view = 'placeholder';
  placeholder.textContent = 'Click tree nodes to see details.';

  const single = document.createElement('div');
  single.dataset.view = 'single';
  single.hidden = true;

  const multi = document.createElement('div');
  multi.dataset.view = 'multi';
  multi.hidden = true;

  const summary = document.createElement('div');
  summary.className = 'selection-info-summary';
  const summaryLabel = document.createElement('strong');
  summaryLabel.append('Selected ');
  const countEl = document.createElement('span');
  countEl.dataset.role = 'count';
  countEl.textContent = '0';
  summaryLabel.appendChild(countEl);
  summaryLabel.append(' nodes');
  summary.appendChild(summaryLabel);

  const samplesEl = document.createElement('div');
  samplesEl.className = 'selection-info-samples';

  const totalEl = document.createElement('div');
  totalEl.className = 'selection-info-total';

  multi.appendChild(summary);
  multi.appendChild(samplesEl);
  multi.appendChild(totalEl);

  selectionInfoEl.appendChild(placeholder);
  selectionInfoEl.appendChild(single);
  selectionInfoEl.appendChild(multi);

  selectionInfoViewState.placeholder = placeholder;
  selectionInfoViewState.single = single;
  selectionInfoViewState.multi = multi;
  selectionInfoViewState.multiCount = countEl;
  selectionInfoViewState.multiSamples = samplesEl;
  selectionInfoViewState.multiTotal = totalEl;
  selectionInfoViewState.currentView = 'placeholder';
  return selectionInfoViewState;
}

function showSelectionInfoView(viewKey, viewState) {
  if (!viewState) {
    return;
  }
  ['placeholder', 'single', 'multi'].forEach((name) => {
    const target = viewState[name];
    if (!target) {
      return;
    }
    target.hidden = name !== viewKey;
  });
  viewState.currentView = viewKey;
}

function updateSelectionDetails() {
  if (!selectionInfoEl) {
    return;
  }
  const viewState = ensureSelectionInfoViews();
  if (!viewState) {
    return;
  }
  if (!selectionState.nodeIds.size || !cachedPayload) {
    showSelectionInfoView('placeholder', viewState);
    return;
  }
  if (selectionState.nodeIds.size === 1) {
    const [singleId] = selectionState.nodeIds;
    const node = cachedNodeMap.get(singleId);
    if (!node) {
      viewState.single.textContent = 'Unable to load node details.';
      showSelectionInfoView('single', viewState);
      return;
    }
    const approxYear = animationState.referenceYear && Number.isFinite(node.time_before_present)
      ? animationState.referenceYear - node.time_before_present
      : null;
    const infoHtml = buildNodePopup(node, approxYear);
    viewState.single.innerHTML = infoHtml || `<strong>${escapeHtml(node.label || node.id || 'node')}</strong>`;
    showSelectionInfoView('single', viewState);
    return;
  }

  const total = Array.isArray(cachedPayload.nodes) ? cachedPayload.nodes.length : selectionState.nodeIds.size;
  const samples = [];
  selectionState.nodeIds.forEach((id) => {
    if (samples.length >= 5) {
      return;
    }
    const node = cachedNodeMap.get(id);
    samples.push(escapeHtml(node?.label || node?.id || id));
  });
  const ellipsis = selectionState.nodeIds.size > samples.length ? '…' : '';
  if (viewState.multiCount) {
    viewState.multiCount.textContent = `${selectionState.nodeIds.size}`;
  }
  if (viewState.multiSamples) {
    viewState.multiSamples.textContent = `${samples.join(', ')}${ellipsis}`;
  }
  if (viewState.multiTotal) {
    viewState.multiTotal.textContent = `Total nodes in tree: ${total}`;
  }
  showSelectionInfoView('multi', viewState);
}

function convertDateToYearFraction(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const diffMs = date.getTime() - start;
  return year + diffMs / (365.25 * 24 * 60 * 60 * 1000);
}

function inferReferenceDate(nodes) {
  let latest = null;
  const dateRegex = /(date|year)/i;
  nodes.forEach((node) => {
    if (!node.traits) {
      return;
    }
    Object.entries(node.traits).forEach(([key, value]) => {
      if (!dateRegex.test(key)) {
        return;
      }
      const parsed = Date.parse(value);
      if (Number.isNaN(parsed)) {
        return;
      }
      const date = new Date(parsed);
      if (!latest || date > latest) {
        latest = date;
      }
    });
  });
  return latest;
}

function updateTimelineDomain(minYear, maxYear, referenceDate, referenceYear) {
  if (!Number.isFinite(minYear) || !Number.isFinite(maxYear) || minYear === maxYear) {
    animationState.domain = null;
    animationState.currentYear = null;
    animationState.referenceDate = referenceDate || null;
    animationState.referenceYear = referenceYear || null;
    animationState.useTimelineFilter = false;
    updateTimelineControlsAvailability();
    updateTimelineLabel();
    return;
  }
  const domainMin = Math.min(minYear, maxYear);
  const domainMax = Math.max(minYear, maxYear);
  animationState.domain = { min: domainMin, max: domainMax };
  animationState.referenceDate = referenceDate || null;
  animationState.referenceYear = referenceYear || null;
  if (!Number.isFinite(animationState.currentYear)) {
    animationState.currentYear = domainMin;
  }
  animationState.currentYear = Math.max(domainMin, Math.min(animationState.currentYear, domainMax));
  animationState.useTimelineFilter = false;
  if (timelineSlider) {
    timelineSlider.min = domainMin.toFixed(4);
    timelineSlider.max = domainMax.toFixed(4);
    const step = Math.max(0.0005, (domainMax - domainMin) / 800);
    timelineSlider.step = step.toFixed(4);
    timelineSlider.value = animationState.currentYear.toFixed(4);
  }
  updateTimelineControlsAvailability();
  updateTimelineLabel();
}

function yearFractionToDate(yearFraction) {
  if (!Number.isFinite(yearFraction)) {
    return null;
  }
  const wholeYear = Math.trunc(yearFraction);
  const remainder = yearFraction - wholeYear;
  const days = remainder * 365.25;
  const date = new Date(Date.UTC(wholeYear, 0, 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function updateTimelineLabel() {
  if (!timelineLabel) {
    return;
  }
  if (!animationState.domain || !Number.isFinite(animationState.currentYear)) {
    const hasData = (Array.isArray(animationState.events) && animationState.events.length > 0)
      || (Array.isArray(animationState.nodeAppearances) && animationState.nodeAppearances.length > 0);
    timelineLabel.textContent = hasData ? 'Timeline unavailable' : 'No timeline';
    return;
  }
  const approxDate = yearFractionToDate(animationState.currentYear);
  if (approxDate) {
    timelineLabel.textContent = `${animationState.currentYear.toFixed(2)} (${formatDateLabel(approxDate)})`;
  } else {
    timelineLabel.textContent = animationState.currentYear.toFixed(2);
  }
}

function updateTimelineControlsAvailability() {
  if (!timelineSlider || !playMigrationButton) {
    return;
  }
  const hasDomain = Boolean(animationState.domain)
    && Number.isFinite(animationState?.domain?.min)
    && Number.isFinite(animationState?.domain?.max)
    && animationState.domain.min !== animationState.domain.max;
  const hasData = (Array.isArray(animationState.events) && animationState.events.length > 0)
    || (Array.isArray(animationState.nodeAppearances) && animationState.nodeAppearances.length > 0);
  const enabled = hasDomain && hasData;
  timelineSlider.disabled = !enabled;
  playMigrationButton.disabled = !enabled;
  if (!enabled) {
    pauseMigrationAnimation();
    timelineLabel.textContent = hasData ? 'Timeline unavailable' : 'No timeline';
  }
}

function refreshMigrationLayer() {
  if (timelineSlider && animationState.domain && Number.isFinite(animationState.currentYear)) {
    const sliderYear = Math.max(animationState.domain.min, Math.min(animationState.currentYear, animationState.domain.max));
    timelineSlider.value = sliderYear.toFixed(4);
  }
  updateTimelineLabel();
  updateBaseMarkerVisibility();
  if (!animationLayerGroup || !animationState.domain || !Number.isFinite(animationState.currentYear)) {
    return;
  }
  animationLayerGroup.clearLayers();
  const cutoff = animationState.currentYear;
  const selected = selectionState.nodeIds;
  const filterBySelection = selected && selected.size > 0;

  animationState.nodeAppearances.forEach((appearance) => {
    if (appearance.year > cutoff) {
      return;
    }
    if (filterBySelection && !selected.has(appearance.id)) {
      return;
    }
    animationLayerGroup.addLayer(L.circleMarker(appearance.coord, {
      radius: Math.max(vizState.nodeRadius + 1, 5),
      color: '#0f172a',
      weight: 1.2,
      fillColor: '#fb7185',
      fillOpacity: 0.85,
    }));
  });

  let latestEvent = null;
  animationState.events.forEach((event) => {
    if (event.endYear > cutoff) {
      return;
    }
    if (filterBySelection && (!selected.has(event.parentId) || !selected.has(event.childId))) {
      return;
    }
    animationLayerGroup.addLayer(L.polyline([event.startCoord, event.endCoord], {
      color: '#2563eb',
      weight: 2.4,
      opacity: 0.7,
    }));
    if (!latestEvent || event.endYear > latestEvent.endYear) {
      latestEvent = event;
    }
  });

  if (latestEvent) {
    animationLayerGroup.addLayer(L.polyline([latestEvent.startCoord, latestEvent.endCoord], {
      color: '#be123c',
      weight: 3.2,
      opacity: 0.85,
    }));
  }
}

function prepareMigrationEvents(payload) {
  if (!payload) {
    animationState.events = [];
    animationState.nodeAppearances = [];
    animationState.domain = null;
    animationState.appearanceById = new Map();
    updateTimelineControlsAvailability();
    updateTimelineLabel();
    return;
  }
  const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
  const edges = Array.isArray(payload.edges) ? payload.edges : [];
  const referenceDate = vizState.latestDate || inferReferenceDate(nodes) || new Date();
  const referenceYear = convertDateToYearFraction(referenceDate) || new Date().getFullYear();

  const appearances = [];
  nodes.forEach((node) => {
    const coord = nodeCoordinateCache.get(node.id);
    if (!coord || !Number.isFinite(node.time_before_present)) {
      return;
    }
    const year = referenceYear - node.time_before_present;
    appearances.push({ id: node.id, coord, year, node });
  });

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const events = [];
  edges.forEach((edge) => {
    const parent = nodesById.get(edge.parent_id);
    const child = nodesById.get(edge.child_id);
    const startCoord = nodeCoordinateCache.get(edge.parent_id);
    const endCoord = nodeCoordinateCache.get(edge.child_id);
    if (!parent || !child || !startCoord || !endCoord) {
      return;
    }
    if (!Number.isFinite(parent.time_before_present) || !Number.isFinite(child.time_before_present)) {
      return;
    }
    events.push({
      parentId: parent.id,
      childId: child.id,
      startCoord,
      endCoord,
      startYear: referenceYear - parent.time_before_present,
      endYear: referenceYear - child.time_before_present,
    });
  });

  events.sort((a, b) => a.endYear - b.endYear);
  appearances.sort((a, b) => a.year - b.year);

  animationState.events = events;
  animationState.nodeAppearances = appearances;
  animationState.appearanceById = new Map(appearances.map((entry) => [entry.id, entry]));

  const yearValues = [];
  events.forEach((event) => {
    if (Number.isFinite(event.startYear)) {
      yearValues.push(event.startYear);
    }
    if (Number.isFinite(event.endYear)) {
      yearValues.push(event.endYear);
    }
  });
  appearances.forEach((appearance) => {
    if (Number.isFinite(appearance.year)) {
      yearValues.push(appearance.year);
    }
  });

  if (yearValues.length) {
    updateTimelineDomain(Math.min(...yearValues), Math.max(...yearValues), referenceDate, referenceYear);
  } else {
    animationState.domain = null;
    animationState.currentYear = null;
    animationState.referenceDate = referenceDate;
    animationState.referenceYear = referenceYear;
    animationState.appearanceById = new Map();
    updateTimelineControlsAvailability();
    updateTimelineLabel();
  }
}

function pauseMigrationAnimation() {
  animationState.playing = false;
  if (animationState.rafId) {
    cancelAnimationFrame(animationState.rafId);
    animationState.rafId = null;
  }
  animationState.lastTimestamp = null;
  if (playMigrationButton) {
    playMigrationButton.textContent = 'Play';
  }
}

function stepMigrationAnimation(timestamp) {
  if (!animationState.playing || !animationState.domain) {
    return;
  }
  if (animationState.lastTimestamp === null) {
    animationState.lastTimestamp = timestamp;
    animationState.rafId = requestAnimationFrame(stepMigrationAnimation);
    return;
  }
  const deltaMs = timestamp - animationState.lastTimestamp;
  animationState.lastTimestamp = timestamp;
  const span = animationState.domain.max - animationState.domain.min;
  const yearsPerMs = span / (25 * 1000);
  animationState.currentYear += deltaMs * yearsPerMs;
  if (animationState.currentYear >= animationState.domain.max) {
    animationState.currentYear = animationState.domain.max;
    refreshMigrationLayer();
    pauseMigrationAnimation();
    return;
  }
  refreshMigrationLayer();
  animationState.rafId = requestAnimationFrame(stepMigrationAnimation);
}

function toggleMigrationAnimation() {
  if (!animationState.domain) {
    return;
  }
  if (animationState.playing) {
    pauseMigrationAnimation();
    return;
  }
  animationState.playing = true;
  animationState.useTimelineFilter = true;
  animationState.lastTimestamp = null;
  if (animationState.domain) {
    const span = animationState.domain.max - animationState.domain.min;
    const preloadOffset = Math.max(span / 200, 0.001);
    animationState.currentYear = animationState.domain.min - preloadOffset;
  }
  refreshMigrationLayer();
  if (playMigrationButton) {
    playMigrationButton.textContent = 'Pause';
  }
  animationState.rafId = requestAnimationFrame(stepMigrationAnimation);
}

function stringifyValue(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toString() : value.toFixed(3);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (err) {
      return String(value);
    }
  }
  return String(value);
}

function summarizeTraits(nodes) {
  const summary = new Map();
  nodes.forEach((node) => {
    const traits = node.traits || {};
    Object.entries(traits).forEach(([key, value]) => {
      const normalized = Array.isArray(value) ? value : [value];
      normalized.forEach((entry) => {
        const asString = stringifyValue(entry);
        if (!summary.has(key)) {
          summary.set(key, new Map());
        }
        const traitMap = summary.get(key);
        traitMap.set(asString, (traitMap.get(asString) || 0) + 1);
      });
    });
  });

  const traitEntries = Array.from(summary.entries()).map(([trait, values]) => {
    const total = Array.from(values.values()).reduce((acc, val) => acc + val, 0);
    const sorted = Array.from(values.entries()).sort((a, b) => b[1] - a[1]);
    return { trait, total, values: sorted };
  }).sort((a, b) => b.total - a.total);

  return traitEntries;
}

function updateTraitSummary() {
  if (!traitSummaryContainer || !traitSummaryCache) {
    return;
  }

  const searchTerm = (traitSearchInput?.value || '').trim().toLowerCase();
  const limitValue = traitLimitSelect?.value || '10';
  const limit = limitValue === 'all' ? Number.POSITIVE_INFINITY : Number.parseInt(limitValue, 10);

  traitSummaryContainer.innerHTML = '';

  traitSummaryCache
    .filter((entry) => {
      if (!searchTerm) {
        return true;
      }
      const traitKey = entry.trait.toLowerCase();
      const labelKey = getTraitDisplayName(entry.trait).toLowerCase();
      return traitKey.includes(searchTerm) || labelKey.includes(searchTerm);
    })
    .forEach((entry) => {
      const card = document.createElement('div');
      card.className = 'trait-card';

      const title = document.createElement('h3');
      title.textContent = `${getTraitDisplayName(entry.trait)} (${entry.total})`;
      card.appendChild(title);

      const list = document.createElement('ul');
      entry.values.slice(0, limit).forEach(([value, count]) => {
        const item = document.createElement('li');
        const labelSpan = document.createElement('span');
        labelSpan.textContent = value;
        const countSpan = document.createElement('span');
        countSpan.textContent = count;
        item.append(labelSpan, countSpan);
        list.appendChild(item);
      });
      card.appendChild(list);

      traitSummaryContainer.appendChild(card);
    });

  if (traitSummaryContainer.children.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No traits match current filters.';
    empty.style.color = '#64748b';
    empty.style.margin = '0';
    traitSummaryContainer.appendChild(empty);
  }
}

async function render(forceFetch = true, filename = null) {
  try {
    if (filename !== null) {
      currentFilename = filename;
    }
    if (forceFetch) {
      setStatus('Loading tree…');
    }

    const needFetch = forceFetch || cachedPayload === null || cachedFilename !== currentFilename;
    if (needFetch) {
      cachedPayload = await fetchTree(currentFilename);
      cachedFilename = currentFilename;
      cachedNodeMap = Array.isArray(cachedPayload?.nodes)
        ? new Map(cachedPayload.nodes.map((node) => [node.id, node]))
        : new Map();
      traitStatsCache = null;
      controlsInitialized = false;
      pauseMigrationAnimation();
      if (metadataState.records.size) {
        const result = applyMetadataToNodes(cachedPayload);
        metadataState.appliedColumns = result.columns;
      } else {
        metadataState.appliedColumns = [];
      }
      resetDiscretePanel();
    }

    if (!controlsInitialized || needFetch) {
      updateTraitOptions(cachedPayload.nodes || []);
      if (layoutSelect) {
        layoutSelect.value = vizState.layout;
      }
      if (nodeSizeInput) {
        nodeSizeInput.value = vizState.nodeRadius;
      }
      if (toggleLabelsCheckbox) {
        toggleLabelsCheckbox.checked = vizState.showLabels;
      }
      if (sortSelect) {
        sortSelect.value = vizState.sortOrder;
      }
      if (colorDirectionSelect) {
        colorDirectionSelect.value = vizState.colorDirection;
      }
      if (hpdSelect) {
        hpdSelect.value = vizState.hpdMode || 'none';
      }
      if (hpdColorInput) {
        hpdColorInput.value = vizState.hpdColor || '#f97316';
      }
      if (latestDateInput) {
        latestDateInput.value = vizState.latestDate instanceof Date
          ? formatDateLabel(vizState.latestDate)
          : '';
      }
      if (brushToggleCheckbox) {
        brushToggleCheckbox.checked = brushState.enabled;
      }
      controlsInitialized = true;
    }

    renderTree(cachedPayload);
    renderMap(cachedPayload);
    renderTraits(cachedPayload);
    updateDiscreteControlsAvailability();
    if (forceFetch) {
      setStatus('Tree rendered successfully');
    }
  } catch (error) {
    console.error(error);
    setStatus(`Error: ${error.message}`);
  }
}

async function fetchMigrationMatrix() {
  if (!migrationMatrixTable) {
    return;
  }
  if (migrationMatrixButton) {
    migrationMatrixButton.disabled = true;
  }
  setMigrationMatrixStatus('Fetching migration matrix…');
  try {
    const params = new URLSearchParams();
    if (currentFilename) {
      params.set('filename', currentFilename);
    }
    const url = params.toString()
      ? `/api/analysis/migration/matrix?${params.toString()}`
      : '/api/analysis/migration/matrix';
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }
    const payload = await response.json();
    renderMigrationMatrixTable(payload);
    const sourceCount = Array.isArray(payload.sources) ? payload.sources.length : 0;
    const targetCount = Array.isArray(payload.targets) ? payload.targets.length : 0;
    let total = 0;
    if (Array.isArray(payload.counts)) {
      payload.counts.forEach((row) => {
        if (Array.isArray(row)) {
          row.forEach((value) => {
            total += Number(value) || 0;
          });
        }
      });
    }
    setMigrationMatrixStatus(`Loaded ${sourceCount} sources × ${targetCount} targets (${total} transitions).`);
  } catch (error) {
    console.error(error);
    setMigrationMatrixStatus(`Failed to load migration matrix: ${error.message}`, true);
  } finally {
    if (migrationMatrixButton) {
      migrationMatrixButton.disabled = false;
    }
  }
}

function setStatus(message) {
  statusEl.textContent = message;
}

function setDiscreteStatus(message = '', isError = false) {
  if (!discreteStatusEl) {
    return;
  }
  discreteStatusEl.textContent = message;
  discreteStatusEl.style.color = isError ? '#b91c1c' : '#1b4965';
}

function setComparisonStatus(message = '', isError = false) {
  if (!comparisonStatusEl) {
    return;
  }
  comparisonStatusEl.textContent = message;
  comparisonStatusEl.style.color = isError ? '#b91c1c' : '#1b4965';
}

function generateComparisonItemId() {
  comparisonItemCounter += 1;
  return `tree-${Date.now()}-${comparisonItemCounter}`;
}

function inferLabelFromFilename(filename) {
  if (!filename) {
    return 'Tree';
  }
  const segments = `${filename}`.split(/[\\/]/);
  const last = segments.pop() || filename;
  const stem = last.includes('.') ? last.substring(0, last.lastIndexOf('.')) : last;
  return stem || last || 'Tree';
}

function loadPersistedComparisonItems() {
  try {
    if (!window?.localStorage) {
      return [];
    }
    const stored = window.localStorage.getItem('localPhylogeoComparisonTrees');
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item) => item && item.filename)
      .map((item) => ({
        id: generateComparisonItemId(),
        filename: item.filename,
        label: item.label || inferLabelFromFilename(item.filename),
        selected: item.selected !== false,
      }));
  } catch (error) {
    console.warn('Failed to load comparison cache', error);
    return [];
  }
}

function persistComparisonItems() {
  try {
    if (!window?.localStorage) {
      return;
    }
    const payload = comparisonState.items.map((item) => ({
      filename: item.filename,
      label: item.label,
      selected: Boolean(item.selected),
    }));
    window.localStorage.setItem('localPhylogeoComparisonTrees', JSON.stringify(payload));
  } catch (error) {
    console.warn('Failed to persist comparison cache', error);
  }
}

function resetDiscretePanel() {
  discreteState.analysisId = null;
  discreteState.exports = {};
  populateRootPosterior([]);
  populatePathways([]);
  updateDiscreteDownloadLinks();
  setDiscreteStatus('');
}

function populateRootPosterior(entries) {
  if (!rootPosteriorBody) {
    return;
  }
  rootPosteriorBody.innerHTML = '';
  if (!entries.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.textContent = 'Run analysis to populate this table.';
    cell.style.color = '#64748b';
    row.appendChild(cell);
    rootPosteriorBody.appendChild(row);
    return;
  }
  entries.forEach((entry, index) => {
    const row = document.createElement('tr');
    const rankCell = document.createElement('td');
    rankCell.textContent = `${index + 1}`;
    const locationCell = document.createElement('td');
    locationCell.textContent = entry.location;
    const probCell = document.createElement('td');
    probCell.textContent = formatNumber(entry.probability, 4);
    row.appendChild(rankCell);
    row.appendChild(locationCell);
    row.appendChild(probCell);
    rootPosteriorBody.appendChild(row);
  });
}

function formatSupportText(edge) {
  const parts = [];
  if (typeof edge.bayes_factor === 'number') {
    parts.push(`BF ${formatNumber(edge.bayes_factor, 2)}`);
  }
  if (typeof edge.posterior_support === 'number') {
    parts.push(`p ${formatNumber(edge.posterior_support, 3)}`);
  }
  if (typeof edge.jumps_mean === 'number') {
    let text = `jumps ${formatNumber(edge.jumps_mean, 2)}`;
    if (typeof edge.jumps_hpd_low === 'number' && typeof edge.jumps_hpd_high === 'number') {
      text += ` (${formatNumber(edge.jumps_hpd_low, 2)}–${formatNumber(edge.jumps_hpd_high, 2)})`;
    }
    parts.push(text);
  }
  return parts.length ? parts.join(', ') : '–';
}

function populatePathways(entries) {
  if (!pathwaysBody) {
    return;
  }
  pathwaysBody.innerHTML = '';
  if (!entries.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.textContent = 'No pathways available. Run analysis after loading a tree.';
    cell.style.color = '#64748b';
    row.appendChild(cell);
    pathwaysBody.appendChild(row);
    return;
  }

  entries.forEach((edge, index) => {
    const row = document.createElement('tr');
    const cells = [
      `${index + 1}`,
      `${edge.src} → ${edge.dst}`,
      formatNumber(edge.weight, 4),
      typeof edge.time_median === 'number' ? formatNumber(edge.time_median, 2) : '–',
      (typeof edge.time_hpd_low === 'number' && typeof edge.time_hpd_high === 'number')
        ? `${formatNumber(edge.time_hpd_low, 2)}–${formatNumber(edge.time_hpd_high, 2)}`
        : '–',
      formatSupportText(edge),
    ];
    cells.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    });
    pathwaysBody.appendChild(row);
  });
}

function renderComparisonList() {
  if (!comparisonTreeList) {
    return;
  }
  comparisonTreeList.innerHTML = '';
  if (!comparisonState.items.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'placeholder';
    placeholder.textContent = 'Upload or add at least two trees to enable comparison.';
    comparisonTreeList.appendChild(placeholder);
    updateComparisonActionAvailability();
    persistComparisonItems();
    return;
  }

  comparisonState.items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'comparison-tree-row';
    row.dataset.id = item.id;

    const selectLabel = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.role = 'select';
    checkbox.checked = item.selected !== false;
    selectLabel.appendChild(checkbox);
    selectLabel.appendChild(document.createTextNode(' Use'));
    row.appendChild(selectLabel);

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.placeholder = 'Tree label';
    labelInput.value = item.label || '';
    labelInput.dataset.role = 'label';
    row.appendChild(labelInput);

    const filenameSpan = document.createElement('span');
    filenameSpan.className = 'filename';
    filenameSpan.textContent = item.filename;
    row.appendChild(filenameSpan);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.dataset.role = 'remove';
    removeButton.textContent = 'Remove';
    row.appendChild(removeButton);

    comparisonTreeList.appendChild(row);
  });

  updateComparisonActionAvailability();
  persistComparisonItems();
}

function addComparisonItem(filename, label, selected = true) {
  if (!filename) {
    return;
  }
  const cleaned = filename.trim();
  if (!cleaned) {
    return;
  }
  const existing = comparisonState.items.find((item) => item.filename === cleaned);
  if (existing) {
    existing.selected = selected !== false;
    if (label) {
      existing.label = label;
    }
  } else {
    comparisonState.items.push({
      id: generateComparisonItemId(),
      filename: cleaned,
      label: label || inferLabelFromFilename(cleaned),
      selected: selected !== false,
    });
  }
  renderComparisonList();
}

function clearComparisonItems() {
  comparisonState.items = [];
  renderComparisonList();
  setComparisonStatus('Comparison list cleared.');
}

function handleComparisonListInput(event) {
  if (event.target.dataset.role !== 'label') {
    return;
  }
  const row = event.target.closest('.comparison-tree-row');
  if (!row) {
    return;
  }
  const target = comparisonState.items.find((item) => item.id === row.dataset.id);
  if (!target) {
    return;
  }
  target.label = event.target.value;
  persistComparisonItems();
}

function handleComparisonListChange(event) {
  if (event.target.dataset.role !== 'select') {
    return;
  }
  const row = event.target.closest('.comparison-tree-row');
  if (!row) {
    return;
  }
  const target = comparisonState.items.find((item) => item.id === row.dataset.id);
  if (!target) {
    return;
  }
  target.selected = event.target.checked;
  persistComparisonItems();
  updateComparisonActionAvailability();
}

function handleComparisonListClick(event) {
  if (event.target.dataset.role !== 'remove') {
    return;
  }
  const row = event.target.closest('.comparison-tree-row');
  if (!row) {
    return;
  }
  comparisonState.items = comparisonState.items.filter((item) => item.id !== row.dataset.id);
  renderComparisonList();
  setComparisonStatus('Removed tree from comparison list.');
}

function updateComparisonActionAvailability() {
  if (comparisonRunBtn) {
    const selectedCount = comparisonState.items.filter((item) => item.selected).length;
    comparisonRunBtn.disabled = selectedCount < 2;
  }
  if (comparisonClearBtn) {
    comparisonClearBtn.disabled = comparisonState.items.length === 0;
  }
}

function populateComparisonTrees(trees) {
  if (!comparisonTreesBody) {
    return;
  }
  comparisonTreesBody.innerHTML = '';
  if (!trees || !trees.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'Run a tree comparison to view summaries.';
    cell.style.color = '#64748b';
    row.appendChild(cell);
    comparisonTreesBody.appendChild(row);
    return;
  }

  trees.forEach((tree) => {
    const row = document.createElement('tr');
    const rootEntry = Array.isArray(tree.root_distribution) ? tree.root_distribution[0] : null;
    const topPath = Array.isArray(tree.top_paths) ? tree.top_paths[0] : null;

    const cells = [
      tree.label || 'Tree',
      tree.analysis_id || '–',
      rootEntry ? `${rootEntry.location} (${formatNumber(rootEntry.probability, 3)})` : '–',
      topPath ? `${topPath.src} → ${topPath.dst} (${formatNumber(topPath.weight, 3)})` : '–',
    ];

    cells.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    });

    const downloadsCell = document.createElement('td');
    const downloads = [
      ['Nodes', tree.exports?.nodes_csv],
      ['Edges', tree.exports?.edges_csv],
      ['Map', tree.exports?.map_geojson],
      ['Summary', tree.exports?.summary_md],
    ];
    const container = document.createElement('div');
    downloads.forEach(([label, href]) => {
      if (!href) {
        return;
      }
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      link.className = 'mini-link';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      container.appendChild(link);
    });
    if (container.children.length === 0) {
      container.textContent = '–';
      container.style.color = '#64748b';
    }
    downloadsCell.appendChild(container);
    row.appendChild(downloadsCell);

    comparisonTreesBody.appendChild(row);
  });
}

function formatWeightLabel(entry) {
  const label = entry.label || 'Tree';
  const weight = typeof entry.weight === 'number' ? formatNumber(entry.weight, 4) : '0';
  const rank = Number.isFinite(entry.rank) ? `#${entry.rank}` : null;
  return rank ? `${label}: ${weight} (${rank})` : `${label}: ${weight}`;
}

function populateComparisonPaths(paths) {
  if (!comparisonPathsBody) {
    return;
  }
  comparisonPathsBody.innerHTML = '';
  if (!paths || !paths.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'No path differences yet. Upload at least two trees and run the comparison.';
    cell.style.color = '#64748b';
    row.appendChild(cell);
    comparisonPathsBody.appendChild(row);
    return;
  }

  paths.forEach((path, index) => {
    const row = document.createElement('tr');
    const contributions = Array.isArray(path.weights) ? path.weights : [];

    const cells = [
      `${index + 1}`,
      `${path.src} → ${path.dst}`,
      path.leading_label || '–',
      formatNumber(path.delta, 4),
    ];

    cells.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    });

    const weightsCell = document.createElement('td');
    if (!contributions.length) {
      weightsCell.textContent = '–';
    } else {
      const group = document.createElement('div');
      group.className = 'comparison-weight-group';
      contributions.forEach((entry) => {
        const chip = document.createElement('span');
        chip.className = 'comparison-weight-chip';
        chip.textContent = formatWeightLabel(entry);
        if (entry.label === path.leading_label) {
          chip.style.background = '#fef3c7';
          chip.style.color = '#92400e';
        }
        group.appendChild(chip);
      });
      weightsCell.appendChild(group);
    }
    row.appendChild(weightsCell);

    comparisonPathsBody.appendChild(row);
  });
}

async function uploadComparisonFiles() {
  if (!comparisonFilesInput || !comparisonFilesInput.files || !comparisonFilesInput.files.length) {
    setComparisonStatus('Select tree files to upload.', true);
    return;
  }

  if (comparisonUploadBtn) {
    comparisonUploadBtn.disabled = true;
  }
  setComparisonStatus('Uploading comparison trees…');

  let successCount = 0;
  const failures = [];
  for (const file of comparisonFilesInput.files) {
    try {
      const { filename } = await uploadTreeFile(file);
      addComparisonItem(filename, inferLabelFromFilename(file.name), true);
      successCount += 1;
    } catch (error) {
      console.error(error);
      failures.push(`${file.name}: ${error.message}`);
    }
  }

  if (comparisonFilesInput) {
    comparisonFilesInput.value = '';
  }

  if (successCount > 0) {
    setComparisonStatus(`Uploaded ${successCount} tree${successCount > 1 ? 's' : ''} for comparison.`);
  }
  if (failures.length) {
    setComparisonStatus(`Some uploads failed — ${failures.join('; ')}`, true);
  }

  if (comparisonUploadBtn) {
    comparisonUploadBtn.disabled = false;
  }
}

function addManualComparisonTree() {
  const filename = comparisonManualFilenameInput?.value?.trim();
  if (!filename) {
    setComparisonStatus('Enter the tree filename to add.', true);
    return;
  }
  const label = comparisonManualLabelInput?.value?.trim();
  addComparisonItem(filename, label || inferLabelFromFilename(filename), true);
  if (comparisonManualFilenameInput) {
    comparisonManualFilenameInput.value = '';
  }
  if (comparisonManualLabelInput) {
    comparisonManualLabelInput.value = '';
  }
  setComparisonStatus('Tree added to comparison list.');
}

function resolveComparisonTopK() {
  const value = Number.parseInt(comparisonTopKInput?.value, 10);
  if (!Number.isFinite(value) || value <= 0) {
    return 10;
  }
  return Math.min(Math.max(value, 1), 50);
}

async function runTreeComparison() {
  const selected = comparisonState.items.filter((item) => item.selected);
  if (selected.length < 2) {
    setComparisonStatus('Select at least two trees before running the comparison.', true);
    return;
  }

  const topK = resolveComparisonTopK();
  comparisonState.topK = topK;
  if (comparisonTopKInput) {
    comparisonTopKInput.value = `${topK}`;
  }

  const payload = {
    filenames: selected.map((item) => item.filename),
    labels: selected.map((item, index) => item.label?.trim() || `Tree ${index + 1}`),
    top_k: topK,
  };

  if (comparisonRunBtn) {
    comparisonRunBtn.disabled = true;
  }
  setComparisonStatus('Running comparison…');

  try {
    const response = await fetch('/api/analysis/discrete/compare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Comparison failed');
    }
    const result = await response.json();
    comparisonState.result = result;
    populateComparisonTrees(result.trees || []);
    populateComparisonPaths(result.path_differences || []);
    setComparisonStatus(`Comparison complete for ${selected.length} trees.`);
  } catch (error) {
    console.error(error);
    setComparisonStatus(`Comparison error: ${error.message}`, true);
  } finally {
    if (comparisonRunBtn) {
      comparisonRunBtn.disabled = false;
    }
  }
}

function updateDiscreteDownloadLinks() {
  const mapping = [
    [downloadNodesLink, discreteState.exports?.nodes_csv, 'nodes.csv'],
    [downloadEdgesLink, discreteState.exports?.edges_csv, 'edges.csv'],
    [downloadGeojsonLink, discreteState.exports?.map_geojson, 'map.geojson'],
    [downloadSummaryLink, discreteState.exports?.summary_md, 'summary.md'],
  ];
  mapping.forEach(([link, href, filename]) => {
    if (!link) {
      return;
    }
    if (href) {
      link.href = href;
      link.classList.remove('is-disabled');
      link.setAttribute('download', filename);
    } else {
      link.href = '#';
      link.classList.add('is-disabled');
    }
  });
}

function handleDiscreteResult(result) {
  if (!result) {
    return;
  }
  discreteState.analysisId = result.analysis_id || null;
  discreteState.exports = result.exports || {};
  discreteState.topK = Number(pathTopKInput?.value) || 10;
  populateRootPosterior(result.root_distribution || []);
  populatePathways(result.top_paths || []);
  updateDiscreteDownloadLinks();
}

async function runDiscreteAnalysis() {
  if (!runDiscreteAnalysisButton) {
    return;
  }
  if (!cachedPayload) {
    setDiscreteStatus('Load and render an MCC tree first.', true);
    return;
  }

  let topK = Number.parseInt(pathTopKInput?.value, 10);
  if (!Number.isFinite(topK) || topK <= 0) {
    topK = 10;
  }
  topK = Math.max(1, Math.min(topK, 25));
  if (pathTopKInput) {
    pathTopKInput.value = `${topK}`;
  }
  discreteState.topK = topK;

  const formData = new FormData();
  if (cachedFilename) {
    formData.append('filename', cachedFilename);
  } else if (currentFilename) {
    formData.append('filename', currentFilename);
  }
  formData.append('top_k', `${topK}`);
  if (supportFileInput && supportFileInput.files && supportFileInput.files.length > 0) {
    formData.append('support_file', supportFileInput.files[0]);
  }

  runDiscreteAnalysisButton.disabled = true;
  setDiscreteStatus('Running discrete analysis…');

  try {
    const response = await fetch('/api/analysis/discrete', {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      let detail = 'Failed to run analysis.';
      try {
        const errorPayload = await response.json();
        if (errorPayload?.detail) {
          detail = errorPayload.detail;
        }
      } catch (e) {
        // Ignore JSON decoding errors.
      }
      throw new Error(detail);
    }
    const result = await response.json();
    handleDiscreteResult(result);
    setDiscreteStatus('Analysis complete.');
  } catch (error) {
    console.error(error);
    setDiscreteStatus(error instanceof Error ? error.message : 'Analysis failed.', true);
  } finally {
    runDiscreteAnalysisButton.disabled = false;
  }
}

function updateDiscreteControlsAvailability() {
  if (!runDiscreteAnalysisButton) {
    return;
  }
  const hasTree = Boolean(cachedPayload && Array.isArray(cachedPayload.nodes) && cachedPayload.nodes.length > 0);
  runDiscreteAnalysisButton.disabled = !hasTree;
  if (!hasTree) {
    updateDiscreteDownloadLinks();
  }
}

async function uploadTreeFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/tree/upload', {
    method: 'POST',
    body: formData,
  });

  const rawBody = await response.text();

  if (!response.ok) {
    let detail = 'Upload failed';
    if (rawBody) {
      try {
        const parsed = JSON.parse(rawBody);
        if (parsed?.detail) {
          detail = parsed.detail;
        } else {
          detail = rawBody;
        }
      } catch (error) {
        detail = rawBody;
      }
    }
    throw new Error(detail);
  }

  let payload;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
    throw new Error('Unexpected upload response.');
  }

  const filename = payload.stored_path || payload.filename || null;
  if (!filename) {
    throw new Error('The backend did not return a file path.');
  }
  return { filename, payload };
}

async function uploadAndRender() {
  if (!uploadInput.files.length) {
    setStatus('Please choose an MCC tree file');
    return;
  }
  const file = uploadInput.files[0];

  uploadBtn.disabled = true;
  setStatus('Uploading…');

  try {
    const { filename } = await uploadTreeFile(file);
    setStatus('Upload complete. Rendering…');
    await render(true, filename);
  } catch (error) {
    console.error(error);
    setStatus(`Upload error: ${error.message}`);
  } finally {
    uploadBtn.disabled = false;
  }
}

uploadBtn.addEventListener('click', uploadAndRender);

if (metadataButton) {
  metadataButton.addEventListener('click', async () => {
    if (!metadataInput || !metadataInput.files || !metadataInput.files.length) {
      setStatus('Please choose a metadata file (TSV/CSV).');
      return;
    }
    const file = metadataInput.files[0];
    try {
      setStatus('Processing metadata…');
      const parsed = await parseMetadataFile(file);
      metadataState.records = parsed.records;
      metadataState.columns = parsed.columns;
      metadataState.idField = parsed.idField;
      metadataState.columnKeyMap = parsed.columnKeyMap;
      metadataState.filename = file.name;
      const result = cachedPayload ? applyMetadataToNodes(cachedPayload) : { matched: 0, columns: [] };
      traitStatsCache = null;
      if (cachedPayload) {
        cachedNodeMap = Array.isArray(cachedPayload.nodes)
          ? new Map(cachedPayload.nodes.map((node) => [node.id, node]))
          : new Map();
        updateTraitOptions(cachedPayload.nodes || []);
        renderTree(cachedPayload);
        renderMap(cachedPayload);
        renderTraits(cachedPayload);
      }
      setStatus(`Metadata applied to ${result.matched} tips from ${file.name}.`);
    } catch (error) {
      console.error(error);
      setStatus(`Metadata error: ${error.message}`);
    }
  });
}

if (runDiscreteAnalysisButton) {
  runDiscreteAnalysisButton.addEventListener('click', () => {
    runDiscreteAnalysis();
  });
}

if (migrationMatrixButton) {
  migrationMatrixButton.addEventListener('click', () => {
    fetchMigrationMatrix();
  });
  fetchMigrationMatrix();
}

renderComparisonList();
populateComparisonTrees([]);
populateComparisonPaths([]);

if (comparisonTreeList) {
  comparisonTreeList.addEventListener('input', handleComparisonListInput);
  comparisonTreeList.addEventListener('change', handleComparisonListChange);
  comparisonTreeList.addEventListener('click', handleComparisonListClick);
}

if (comparisonUploadBtn) {
  comparisonUploadBtn.addEventListener('click', uploadComparisonFiles);
}

if (comparisonAddManualBtn) {
  comparisonAddManualBtn.addEventListener('click', addManualComparisonTree);
}

if (comparisonClearBtn) {
  comparisonClearBtn.addEventListener('click', clearComparisonItems);
}

if (comparisonRunBtn) {
  comparisonRunBtn.addEventListener('click', runTreeComparison);
}

if (comparisonTopKInput) {
  comparisonTopKInput.addEventListener('change', () => {
    const resolved = resolveComparisonTopK();
    comparisonState.topK = resolved;
    comparisonTopKInput.value = `${resolved}`;
  });
}

if (pathTopKInput) {
  pathTopKInput.addEventListener('change', () => {
    let topK = Number.parseInt(pathTopKInput.value, 10);
    if (!Number.isFinite(topK) || topK <= 0) {
      topK = 10;
    }
    topK = Math.max(1, Math.min(topK, 25));
    pathTopKInput.value = `${topK}`;
    discreteState.topK = topK;
  });
}

if (colorSelect) {
  colorSelect.addEventListener('change', (event) => {
    vizState.colorTrait = event.target.value || 'auto';
    refreshVisualizations();
  });
}

if (layoutSelect) {
  layoutSelect.addEventListener('change', (event) => {
    vizState.layout = event.target.value || 'time';
    refreshVisualizations();
  });
}

if (nodeSizeInput) {
  nodeSizeInput.addEventListener('input', (event) => {
    const value = Number.parseInt(event.target.value, 10);
    if (Number.isFinite(value)) {
      vizState.nodeRadius = value;
      refreshVisualizations();
    }
  });
}

if (toggleLabelsCheckbox) {
  toggleLabelsCheckbox.addEventListener('change', (event) => {
    vizState.showLabels = event.target.checked;
    refreshVisualizations();
  });
}

if (resetTreeButton) {
  resetTreeButton.addEventListener('click', () => {
    resetTreeView();
    resetMapViewport();
  });
}

if (sortSelect) {
  sortSelect.addEventListener('change', (event) => {
    vizState.sortOrder = event.target.value || 'increasing';
    refreshVisualizations();
  });
}

if (colorDirectionSelect) {
  colorDirectionSelect.addEventListener('change', (event) => {
    vizState.colorDirection = event.target.value || 'increasing';
    refreshVisualizations();
  });
}

if (hpdSelect) {
  hpdSelect.addEventListener('change', (event) => {
    vizState.hpdMode = event.target.value || 'none';
    refreshHpdOverlay();
  });
}

if (hpdColorInput) {
  hpdColorInput.addEventListener('input', (event) => {
    const value = typeof event.target.value === 'string' ? event.target.value : '';
    if (value) {
      vizState.hpdColor = value;
      refreshHpdOverlay();
    }
  });
}

if (brushToggleCheckbox) {
  brushToggleCheckbox.addEventListener('change', (event) => {
    brushState.enabled = Boolean(event.target.checked);
    if (!brushState.enabled) {
      if (treeRenderState.brushLayer) {
        treeRenderState.brushLayer.remove();
        treeRenderState.brushLayer = null;
        treeRenderState.brush = null;
      }
      updateBaseMarkerVisibility();
      return;
    }
    const margin = treeRenderState.margin;
    const size = treeRenderState.layoutSize;
    if (margin && size) {
      setupTreeBrush(margin, size.width, size.height);
    } else if (cachedPayload) {
      refreshVisualizations();
    }
    updateBaseMarkerVisibility();
  });
}

if (latestDateInput) {
  latestDateInput.addEventListener('change', (event) => {
    const parsed = parseDateInput(event.target.value);
    vizState.latestDate = parsed;
    event.target.value = parsed ? formatDateLabel(parsed) : '';
    refreshVisualizations();
  });
}

if (traitSearchInput) {
  traitSearchInput.addEventListener('input', () => {
    updateTraitSummary();
  });
}

if (traitLimitSelect) {
  traitLimitSelect.addEventListener('change', () => {
    updateTraitSummary();
  });
}

if (exportTreeButton) {
  exportTreeButton.addEventListener('click', () => {
    downloadTreeSVG();
  });
}

if (exportMapGeoJSONButton) {
  exportMapGeoJSONButton.addEventListener('click', () => {
    downloadMapGeoJSON();
  });
}

if (exportMapImageButton) {
  exportMapImageButton.addEventListener('click', () => {
    downloadMapImage();
  });
}

if (applyMapLinkButton) {
  applyMapLinkButton.addEventListener('click', () => {
    const rawUrl = (mapTileUrlInput && typeof mapTileUrlInput.value === 'string')
      ? mapTileUrlInput.value.trim()
      : '';
    if (!rawUrl) {
      setMapStatus('Enter a tile URL before applying.', true);
      return;
    }
    if (!isValidTileTemplate(rawUrl)) {
      setMapStatus('Tile URL must include {z}, {x}, and {y} placeholders.', true);
      return;
    }
    try {
      const config = applyBaseMap({ name: 'Custom link', tileUrl: rawUrl });
      setMapStatus(`Custom map link applied${config.name ? ` (${config.name})` : ''}.`);
    } catch (error) {
      console.error(error);
      setMapStatus(`Failed to apply map link: ${error.message}`, true);
    }
  });
}

if (applyMapConfigButton) {
  applyMapConfigButton.addEventListener('click', () => {
    if (!mapConfigInput || !mapConfigInput.files || !mapConfigInput.files.length) {
      setMapStatus('Choose a JSON configuration file to upload.', true);
      return;
    }
    const file = mapConfigInput.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const config = applyBaseMap(parsed);
        if (mapTileUrlInput) {
          mapTileUrlInput.value = config.tileUrl;
        }
        setMapStatus(`Map config applied${config.name ? ` (${config.name})` : ''}.`);
      } catch (error) {
        console.error(error);
        setMapStatus(`Failed to apply map config: ${error.message}`, true);
      }
      if (mapConfigInput) {
        mapConfigInput.value = '';
      }
    };
    reader.onerror = () => {
      setMapStatus('Could not read the selected map config file.', true);
      if (mapConfigInput) {
        mapConfigInput.value = '';
      }
    };
    reader.readAsText(file);
  });
}

if (resetMapButton) {
  resetMapButton.addEventListener('click', () => {
    try {
      const config = applyBaseMap(defaultMapConfig);
      setMapStatus(`Reverted to default map${config.name ? ` (${config.name})` : ''}.`);
      if (mapTileUrlInput) {
        mapTileUrlInput.value = '';
      }
      if (mapConfigInput) {
        mapConfigInput.value = '';
      }
      resetMapViewport();
    } catch (error) {
      console.error(error);
      setMapStatus(`Failed to reset map: ${error.message}`, true);
    }
  });
}

if (timelineSlider) {
  timelineSlider.addEventListener('input', (event) => {
    if (!animationState.domain) {
      return;
    }
    const rawValue = Number.parseFloat(event.target.value);
    if (!Number.isFinite(rawValue)) {
      return;
    }
    const clamped = Math.min(Math.max(rawValue, animationState.domain.min), animationState.domain.max);
    animationState.useTimelineFilter = true;
    animationState.currentYear = clamped;
    if (animationState.playing) {
      animationState.lastTimestamp = null;
    }
    refreshMigrationLayer();
  });
}

if (playMigrationButton) {
  playMigrationButton.addEventListener('click', () => {
    toggleMigrationAnimation();
  });
}

if (toggleSidebarBtn && workspace && sidebar) {
  toggleSidebarBtn.addEventListener('click', () => {
    const willHide = !workspace.classList.contains('sidebar-collapsed');
    setSidebarVisibility(willHide);
  });
}

if (sidebarHandleBtn) {
  sidebarHandleBtn.addEventListener('click', () => {
    setSidebarVisibility(false);
  });
}

if (workspace && sidebar) {
  setSidebarVisibility(false);
}

initializeLayoutFromStyles();
applyTreeMapLayout(layoutState.treePanelRatio);
setupPanelResizers();

resetDiscretePanel();
updateDiscreteControlsAvailability();

document.addEventListener('DOMContentLoaded', () => {
  render();
});

window.addEventListener('resize', () => {
  if (cachedPayload) {
    refreshVisualizations();
  }
});
