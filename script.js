// script.js

const state = {
    nodes: {},
    selectedNodeId: null,
    transform: { x: 0, y: 0, scale: 1 },
    apiKey: localStorage.getItem('gemini_api_key') || ''
};

let appState = {
    maps: [], // Array of { id, title, updatedAt }
    currentMapId: null
};

// DOM Elements
const canvasContainer = document.getElementById('canvas-container');
const nodesLayer = document.getElementById('nodes-layer');
const edgesLayer = document.getElementById('edges-layer');
const nodeControls = document.getElementById('node-controls');
const aiLoading = document.getElementById('ai-loading');
const sidebar = document.getElementById('sidebar');
const mapListEl = document.getElementById('map-list');

// Auto-save mechanism
let saveTimeout;
function triggerAutoSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveCurrentMap, 500);
}

// Initialization
function init() {
    loadMapsList();
    if (appState.maps.length > 0) {
        // Load the most recently updated map
        appState.maps.sort((a, b) => b.updatedAt - a.updatedAt);
        loadMap(appState.maps[0].id);
    } else {
        createNewMap();
    }
    setupEvents();
}

// Storage & Management
function loadMapsList() {
    const stored = localStorage.getItem('mindmaps_list');
    if (stored) {
        appState.maps = JSON.parse(stored);
    }
    renderSidebarList();
}

function saveMapsList() {
    localStorage.setItem('mindmaps_list', JSON.stringify(appState.maps));
    renderSidebarList();
}

function createNewMap() {
    const id = 'map_' + Date.now();
    appState.currentMapId = id;
    
    // Reset state
    state.nodes = {};
    state.selectedNodeId = null;
    state.transform = { x: 0, y: 0, scale: 1 };
    
    // Add root
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    addNode('root', 'Central Topic', centerX, centerY, null);
    
    // Add to list
    appState.maps.push({
        id: id,
        title: 'Central Topic',
        updatedAt: Date.now()
    });
    
    saveCurrentMap();
    saveMapsList();
    
    selectNode('root');
    render();
}

function loadMap(mapId) {
    const dataStr = localStorage.getItem(`mindmap_data_${mapId}`);
    if (dataStr) {
        const data = JSON.parse(dataStr);
        state.nodes = data.nodes || {};
        state.transform = data.transform || { x: 0, y: 0, scale: 1 };
        state.selectedNodeId = null;
        appState.currentMapId = mapId;
        
        // Update list sorting
        const mapObj = appState.maps.find(m => m.id === mapId);
        if (mapObj) {
            mapObj.updatedAt = Date.now();
            saveMapsList();
        }
        
        render();
    }
}

function saveCurrentMap() {
    if (!appState.currentMapId) return;
    
    // Update data
    const data = {
        nodes: state.nodes,
        transform: state.transform
    };
    localStorage.setItem(`mindmap_data_${appState.currentMapId}`, JSON.stringify(data));
    
    // Update list title if root changed
    const rootNode = state.nodes['root'];
    const title = rootNode ? rootNode.text : 'Untitled Map';
    
    let listUpdated = false;
    const mapObj = appState.maps.find(m => m.id === appState.currentMapId);
    if (mapObj) {
        if (mapObj.title !== title) {
            mapObj.title = title;
            listUpdated = true;
        }
        mapObj.updatedAt = Date.now();
        listUpdated = true;
    }
    
    if (listUpdated) {
        saveMapsList();
    }
}

function deleteMap(mapId) {
    if (confirm('このマップを削除してもよろしいですか？')) {
        localStorage.removeItem(`mindmap_data_${mapId}`);
        appState.maps = appState.maps.filter(m => m.id !== mapId);
        saveMapsList();
        
        if (appState.currentMapId === mapId) {
            if (appState.maps.length > 0) {
                loadMap(appState.maps[0].id);
            } else {
                createNewMap();
            }
        }
    }
}

// Sidebar Rendering
function renderSidebarList() {
    mapListEl.innerHTML = '';
    // Sort by newest top
    const sortedMaps = [...appState.maps].sort((a, b) => b.updatedAt - a.updatedAt);
    
    sortedMaps.forEach(map => {
        const li = document.createElement('li');
        li.className = 'map-list-item' + (map.id === appState.currentMapId ? ' active' : '');
        
        const dateStr = new Date(map.updatedAt).toLocaleString();
        
        li.innerHTML = `
            <div class="map-info">
                <span class="map-title">${map.title}</span>
                <span class="map-date">${dateStr}</span>
            </div>
            <button class="btn-delete-map" title="削除">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        `;
        
        li.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete-map')) {
                deleteMap(map.id);
            } else {
                loadMap(map.id);
                // On mobile we might close the sidebar here, but we will leave it open for now
            }
        });
        
        mapListEl.appendChild(li);
    });
}

// Node Management
function generateId() {
    return 'node_' + Math.random().toString(36).substr(2, 9);
}

function addNode(id, text, x, y, parentId) {
    state.nodes[id] = { id, text, x, y, parentId };
    render();
    triggerAutoSave();
    return id;
}

function deleteNode(id) {
    if (id === 'root') return; // Cannot delete root
    
    // Recursively delete children
    const children = Object.values(state.nodes).filter(n => n.parentId === id);
    children.forEach(child => deleteNode(child.id));
    
    delete state.nodes[id];
    if (state.selectedNodeId === id) {
        selectNode(null);
    }
    render();
    triggerAutoSave();
}

function updateNodeText(id, text) {
    if (state.nodes[id]) {
        state.nodes[id].text = text;
        render();
        triggerAutoSave();
    }
}

function selectNode(id) {
    state.selectedNodeId = id;
    
    document.querySelectorAll('.mindmap-node').forEach(el => {
        el.classList.remove('selected');
    });

    if (id && state.nodes[id]) {
        const nodeEl = document.getElementById(id);
        if (nodeEl) nodeEl.classList.add('selected');
        showNodeControls(id);
    } else {
        nodeControls.classList.add('hidden');
    }
}

// Rendering
function render() {
    renderNodes();
    renderEdges();
    if (state.selectedNodeId) {
        showNodeControls(state.selectedNodeId);
    }
}

function renderNodes() {
    nodesLayer.innerHTML = '';
    
    Object.values(state.nodes).forEach(node => {
        const div = document.createElement('div');
        div.id = node.id;
        div.className = 'mindmap-node' + (node.id === 'root' ? ' root' : '') + (node.id === state.selectedNodeId ? ' selected' : '');
        div.style.left = `${node.x}px`;
        div.style.top = `${node.y}px`;
        div.textContent = node.text;

        // Interactions
        div.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            selectNode(node.id);
            startDraggingNode(e, node.id);
        });

        div.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            enableEditMode(node.id, div);
        });

        nodesLayer.appendChild(div);
    });
}

function enableEditMode(id, nodeEl) {
    const node = state.nodes[id];
    const input = document.createElement('input');
    input.type = 'text';
    input.value = node.text;
    nodeEl.textContent = '';
    nodeEl.appendChild(input);
    input.focus();

    const save = () => {
        const newText = input.value.trim() || 'Empty Node';
        updateNodeText(id, newText);
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save();
    });
}

function renderEdges() {
    let svgContent = '';
    const { x, y, scale } = state.transform;

    Object.values(state.nodes).forEach(node => {
        if (node.parentId && state.nodes[node.parentId]) {
            const parent = state.nodes[node.parentId];
            
            // Adjust coordinates based on transform/scale
            const pX = (parent.x * scale) + x;
            const pY = (parent.y * scale) + y;
            const cX = (node.x * scale) + x;
            const cY = (node.y * scale) + y;

            // Simple curved line
            const path = `M ${pX} ${pY} C ${pX + (cX - pX) / 2} ${pY}, ${pX + (cX - pX) / 2} ${cY}, ${cX} ${cY}`;
            svgContent += `<path d="${path}" />`;
        }
    });
    
    edgesLayer.innerHTML = svgContent;
    
    // Apply transform to nodes layer
    nodesLayer.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

function showNodeControls(id) {
    const node = state.nodes[id];
    if (!node) return;

    const nodeEl = document.getElementById(id);
    const nodeWidth = nodeEl ? nodeEl.offsetWidth : 120; // 実際のノードの横幅を取得

    const { x, y, scale } = state.transform;
    const screenX = (node.x * scale) + x;
    const screenY = (node.y * scale) + y;

    // ノードのテキスト幅に合わせて右端（ノードの半分の長さ＋余白）にメニューを自動再配置
    const offset = (nodeWidth / 2) * scale + 24; 
    nodeControls.style.left = `${screenX + offset}px`;
    nodeControls.style.top = `${screenY}px`;
    nodeControls.classList.remove('hidden');
}

// Interaction: Drag & Pan
let isPanning = false;
let startPanX = 0, startPanY = 0;
let draggingNodeId = null;
let startDragX = 0, startDragY = 0;
let originalNodeX = 0, originalNodeY = 0;

function setupEvents() {
    // Sidebar toggle
    document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
        sidebar.classList.toggle('hidden-sidebar');
    });

    document.getElementById('btn-new-map').addEventListener('click', () => {
        createNewMap();
    });

    canvasContainer.addEventListener('mousedown', (e) => {
        if (e.target.closest('#node-controls') || e.target.closest('.mindmap-node') || e.target.closest('#sidebar')) return;
        isPanning = true;
        startPanX = e.clientX - state.transform.x;
        startPanY = e.clientY - state.transform.y;
        selectNode(null);
    });

    window.addEventListener('mousemove', (e) => {
        if (isPanning) {
            state.transform.x = e.clientX - startPanX;
            state.transform.y = e.clientY - startPanY;
            renderEdges(); // Fast update
        } else if (draggingNodeId) {
            const dx = (e.clientX - startDragX) / state.transform.scale;
            const dy = (e.clientY - startDragY) / state.transform.scale;
            state.nodes[draggingNodeId].x = originalNodeX + dx;
            state.nodes[draggingNodeId].y = originalNodeY + dy;
            render();
        }
    });

    window.addEventListener('mouseup', () => {
        if (isPanning || draggingNodeId) {
            triggerAutoSave();
        }
        isPanning = false;
        draggingNodeId = null;
    });

    window.addEventListener('wheel', (e) => {
        if (e.target.closest('.modal') || e.target.closest('#sidebar')) return;
        e.preventDefault();
        
        const zoomIntensity = 0.1;
        const wheel = e.deltaY < 0 ? 1 : -1;
        
        // Calculate point relative to transform origin
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        
        const zoomTarget = {
            x: (mouseX - state.transform.x) / state.transform.scale,
            y: (mouseY - state.transform.y) / state.transform.scale
        };

        let newScale = state.transform.scale + wheel * zoomIntensity;
        newScale = Math.min(Math.max(0.2, newScale), 3); // clamp scale
        
        state.transform.x = mouseX - zoomTarget.x * newScale;
        state.transform.y = mouseY - zoomTarget.y * newScale;
        state.transform.scale = newScale;
        
        render();
        triggerAutoSave();
    }, { passive: false });

    // Toolbar & Controls
    document.getElementById('btn-add-node').addEventListener('click', () => {
        if (!state.selectedNodeId) return;
        const parent = state.nodes[state.selectedNodeId];
        const newId = generateId();
        addNode(newId, 'New Idea', parent.x + 150, parent.y + 50, parent.id);
        selectNode(newId);
        enableEditMode(newId, document.getElementById(newId));
    });

    document.getElementById('btn-delete-node').addEventListener('click', () => {
        if (state.selectedNodeId) {
            deleteNode(state.selectedNodeId);
        }
    });

    document.getElementById('btn-edit-node').addEventListener('click', () => {
        if (state.selectedNodeId) {
            enableEditMode(state.selectedNodeId, document.getElementById(state.selectedNodeId));
        }
    });

    // Modals
    document.getElementById('btn-settings').addEventListener('click', () => {
        document.getElementById('api-key').value = state.apiKey;
        document.getElementById('modal-settings').classList.remove('hidden');
    });

    document.getElementById('btn-save-settings').addEventListener('click', () => {
        state.apiKey = document.getElementById('api-key').value.trim();
        localStorage.setItem('gemini_api_key', state.apiKey);
        document.getElementById('modal-settings').classList.add('hidden');
    });

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.modal').classList.add('hidden');
        });
    });

    // AI Generation
    document.getElementById('btn-ai-generate').addEventListener('click', handleAIGeneration);

    // Export Prompt
    document.getElementById('btn-export').addEventListener('click', handleExportPrompt);
    document.getElementById('btn-copy-prompt').addEventListener('click', () => {
        const text = document.getElementById('export-textarea').value;
        navigator.clipboard.writeText(text).then(() => {
            alert('クリップボードにコピーしました！');
        });
    });
}

function startDraggingNode(e, id) {
    if (e.target.tagName.toLowerCase() === 'input') return;
    draggingNodeId = id;
    startDragX = e.clientX;
    startDragY = e.clientY;
    originalNodeX = state.nodes[id].x;
    originalNodeY = state.nodes[id].y;
}

// AI Integration
async function handleAIGeneration() {
    if (!state.selectedNodeId) return;
    if (!state.apiKey) {
        alert('設定からGemini APIキーを入力してください。');
        document.getElementById('modal-settings').classList.remove('hidden');
        return;
    }

    const parentNode = state.nodes[state.selectedNodeId];
    aiLoading.classList.remove('hidden');

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${state.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `マインドマップの1ノード「${parentNode.text}」に関連する、具体的で創造的なサブアイデアを3〜5個生成してください。結果は純粋なJSONの文字列配列として出力してください。Markdown修飾や他の文章は一切含めないでください。 例: ["アイデア1", "アイデア2", "アイデア3"]`
                    }]
                }]
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        let resultText = data.candidates[0].content.parts[0].text;
        
        // Clean up markdown markers if any
        resultText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const ideas = JSON.parse(resultText);

        // Add generated nodes physically around the parent
        const startAngle = -Math.PI / 4;
        const angleStep = Math.PI / (ideas.length * 1.5);
        
        ideas.forEach((idea, index) => {
            const angle = startAngle + (angleStep * index);
            const radius = 180 + Math.random() * 40;
            const newX = parentNode.x + Math.cos(angle) * radius + 100;
            const newY = parentNode.y + Math.sin(angle) * radius;
            
            addNode(generateId(), idea, newX, newY, parentNode.id);
        });

    } catch (error) {
        console.error(error);
        alert('AI生成に失敗しました: ' + error.message);
    } finally {
        aiLoading.classList.add('hidden');
        triggerAutoSave();
    }
}

// Prompt Export
function handleExportPrompt() {
    // Build tree representation
    const buildTreeAscii = (nodeId, level = 0) => {
        const node = state.nodes[nodeId];
        let text = `${'  '.repeat(level)}- ${node.text}\n`;
        
        const children = Object.values(state.nodes).filter(n => n.parentId === nodeId);
        children.forEach(child => {
            text += buildTreeAscii(child.id, level + 1);
        });
        
        return text;
    };

    const treeText = buildTreeAscii('root');
    
    const promptTemplate = `以下の情報（マインドマップで整理した階層的なアイデア・要件）を基にして、最適な成果物を作成してください。

【テーマと構成】
${treeText}

【指示事項】
・上記の情報を網羅し、論理的な構成でまとめてください。
・具体性に欠ける部分は専門的な視点から補完してください。
`;

    document.getElementById('export-textarea').value = promptTemplate;
    document.getElementById('modal-export').classList.remove('hidden');
}


// Start
window.onload = init;
