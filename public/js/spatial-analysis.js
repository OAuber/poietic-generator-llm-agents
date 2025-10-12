// Spatial Analysis - Analyse spatiale et voisinage
import { ColorGenerator } from './poietic-color-generator.js';

const SpatialAnalysis = {
    // Construction de grilles 20×20
    buildGrid20x20: (userId, pixels) => {
        const baseColors = ColorGenerator.generateInitialColors(userId);
        const grid = [];
        for (let y = 0; y < 20; y++) {
            const row = [];
            for (let x = 0; x < 20; x++) {
                const idx = y * 20 + x;
                const key = `${x},${y}`;
                row.push(pixels[key] || baseColors[idx] || '#000000');
            }
            grid.push(row);
        }
        return grid;
    },

    // Vision spatiale (carte ASCII)
    buildSpatialMap: (gridSize, myPosition, userPositions, myUserId) => {
        if (!gridSize || !myPosition) return 'Position inconnue';
        
        const lines = [];
        const border = '═'.repeat(gridSize * 3 + 1);
        lines.push(`\n╔${border}╗`);
        
        for (let gy = -Math.floor(gridSize/2); gy <= Math.floor(gridSize/2); gy++) {
            let line = '║ ';
            for (let gx = -Math.floor(gridSize/2); gx <= Math.floor(gridSize/2); gx++) {
                if (myPosition[0] === gx && myPosition[1] === gy) {
                    line += '██ ';
                } else {
                    let found = false;
                    for (const [uid, pos] of Object.entries(userPositions)) {
                        if (pos[0] === gx && pos[1] === gy && uid !== myUserId) {
                            line += `${uid[0].toUpperCase()}  `;
                            found = true;
                            break;
                        }
                    }
                    if (!found) line += '·  ';
                }
            }
            line += '║';
            lines.push(line);
        }
        
        lines.push(`╚${border}╝`);
        lines.push(`\n📍 MA POSITION: (${myPosition[0]}, ${myPosition[1]})`);
        lines.push('   ██ = MOI | Lettres = Voisins | · = Vide');
        
        return lines.join('\n');
    },

    // Analyse complète des voisins
    analyzeNeighbors: (myPosition, userPositions, otherUsers, myUserId, myCellState) => {
        if (!myPosition || !userPositions) {
            return {};
        }
        
        const directions = {
            "W": [-1, 0], "E": [1, 0], "N": [0, -1], "S": [0, 1],
            "NW": [-1, -1], "NE": [1, -1], "SW": [-1, 1], "SE": [1, 1]
        };
        
        const neighbors = {};
        const myGrid = SpatialAnalysis.buildGrid20x20(myUserId, myCellState);
        
        for (const [dir, [dx, dy]] of Object.entries(directions)) {
            const nx = myPosition[0] + dx;
            const ny = myPosition[1] + dy;
            
            // Trouver le voisin à cette position
            const neighborId = Object.entries(userPositions).find(
                ([uid, pos]) => Array.isArray(pos) && pos[0] === nx && pos[1] === ny && uid !== myUserId
            )?.[0];
            
            if (neighborId) {
                const neighborPixels = otherUsers[neighborId]?.pixels || {};
                const neighborGrid = SpatialAnalysis.buildGrid20x20(neighborId, neighborPixels);
                const pixelCount = Object.keys(neighborPixels).length;
                
                // Calculer métriques uniquement si le voisin a des pixels
                let echoColor = 0;
                let borderSimilarity = 0;
                
                if (pixelCount > 0) {
                    // Echo color (chevauchement de palettes)
                    const myColors = new Set(Object.values(myCellState));
                    const neighborColors = new Set(Object.values(neighborPixels));
                    if (neighborColors.size > 0) {
                        const intersection = [...myColors].filter(c => neighborColors.has(c)).length;
                        echoColor = intersection / neighborColors.size;
                    }
                    
                    // Border similarity (pixels identiques le long de la frontière)
                    let matches = 0;
                    const total = 20;
                    if (dir === 'W') {
                        for (let y = 0; y < 20; y++) {
                            if (myGrid[y][0] === neighborGrid[y][19]) matches++;
                        }
                    } else if (dir === 'E') {
                        for (let y = 0; y < 20; y++) {
                            if (myGrid[y][19] === neighborGrid[y][0]) matches++;
                        }
                    } else if (dir === 'N') {
                        for (let x = 0; x < 20; x++) {
                            if (myGrid[0][x] === neighborGrid[19][x]) matches++;
                        }
                    } else if (dir === 'S') {
                        for (let x = 0; x < 20; x++) {
                            if (myGrid[19][x] === neighborGrid[0][x]) matches++;
                        }
                    }
                    borderSimilarity = matches / total;
                }

                // Palettes de bordure (couleurs les plus fréquentes le long de la frontière partagée)
                const borderPalette = { mine: {}, neighbor: {} };
                const add = (map, color) => { if (!color) return; map[color] = (map[color] || 0) + 1; };
                // Paires alignées (idx, mine, neighbor)
                const borderPairs = [];
                if (dir === 'W') {
                    for (let y = 0; y < 20; y++) { add(borderPalette.mine, myGrid[y][0]); add(borderPalette.neighbor, neighborGrid[y][19]); borderPairs.push({ idx: y, mine: myGrid[y][0], neighbor: neighborGrid[y][19] }); }
                } else if (dir === 'E') {
                    for (let y = 0; y < 20; y++) { add(borderPalette.mine, myGrid[y][19]); add(borderPalette.neighbor, neighborGrid[y][0]); borderPairs.push({ idx: y, mine: myGrid[y][19], neighbor: neighborGrid[y][0] }); }
                } else if (dir === 'N') {
                    for (let x = 0; x < 20; x++) { add(borderPalette.mine, myGrid[0][x]); add(borderPalette.neighbor, neighborGrid[19][x]); borderPairs.push({ idx: x, mine: myGrid[0][x], neighbor: neighborGrid[19][x] }); }
                } else if (dir === 'S') {
                    for (let x = 0; x < 20; x++) { add(borderPalette.mine, myGrid[19][x]); add(borderPalette.neighbor, neighborGrid[0][x]); borderPairs.push({ idx: x, mine: myGrid[19][x], neighbor: neighborGrid[0][x] }); }
                }

                // Runs contigus par couleur côté neighbor (et mine)
                const computeRuns = (pairs, side) => {
                    const runs = [];
                    let current = null;
                    for (let i = 0; i < pairs.length; i++) {
                        const color = side === 'neighbor' ? pairs[i].neighbor : pairs[i].mine;
                        if (!current) {
                            current = { color, start: i, end: i };
                        } else if (color === current.color) {
                            current.end = i;
                        } else {
                            runs.push(current);
                            current = { color, start: i, end: i };
                        }
                    }
                    if (current) runs.push(current);
                    // Trier par longueur décroissante
                    runs.sort((a, b) => (b.end - b.start) - (a.end - a.start));
                    return runs;
                };
                
                const topColors = (freqMap, k = 3) => Object.entries(freqMap)
                    .sort((a,b) => b[1] - a[1])
                    .slice(0, k)
                    .map(([c]) => c);

                // Déduire l'arête locale à utiliser pour la continuité
                const myEdge = (dir === 'W') ? { axis: 'x', value: 0 }
                              : (dir === 'E') ? { axis: 'x', value: 19 }
                              : (dir === 'N') ? { axis: 'y', value: 0 }
                              :                 { axis: 'y', value: 19 };

                // Calcul des runs maintenant, pour pouvoir en déduire des points suggérés
                const runsNeighbor = computeRuns(borderPairs, 'neighbor');
                const runsMine = computeRuns(borderPairs, 'mine');

                // Générer des points suggérés face au run dominant du voisin
                let suggestedPoints = [];
                if (runsNeighbor && runsNeighbor.length > 0) {
                    const r = runsNeighbor[0]; // run le plus long
                    if (myEdge.axis === 'x') {
                        for (let i = r.start; i <= r.end; i++) {
                            suggestedPoints.push({ x: myEdge.value, y: i });
                        }
                    } else {
                        for (let i = r.start; i <= r.end; i++) {
                            suggestedPoints.push({ x: i, y: myEdge.value });
                        }
                    }
                }

                neighbors[dir] = {
                    user_id: neighborId.substring(0, 8),
                    grid: neighborGrid,
                    pixel_count: pixelCount,
                    echo_color: Math.round(echoColor * 1000) / 1000,
                    border_similarity: Math.round(borderSimilarity * 1000) / 1000,
                    border_palette: {
                        mine: topColors(borderPalette.mine),
                        neighbor: topColors(borderPalette.neighbor)
                    },
                    border_pairs: borderPairs,
                    border_runs: {
                        mine: runsMine,
                        neighbor: runsNeighbor
                    },
                    my_edge: myEdge,                // { axis: 'x'|'y', value: 0|19 }
                    suggested_points: suggestedPoints.slice(0, 20), // limiter l'affichage
                    recent_updates: otherUsers[neighborId]?.recentUpdates || [], // Deltas récents
                    last_strategy: otherUsers[neighborId]?.lastStrategy || null   // Stratégie du voisin
                };
            }
        }
        
        return neighbors;
    },

    // Analyse environnement complète
    analyzeEnvironment: (myCellState, otherUsers, myPosition, userPositions, myUserId, gridSize) => {
        const myPixelCount = Object.keys(myCellState).length;
        const neighborCount = Object.keys(otherUsers).length;
        
        const allColors = new Set();
        Object.values(myCellState).forEach(color => allColors.add(color));
        Object.values(otherUsers).forEach(user => {
            Object.values(user.pixels || {}).forEach(color => allColors.add(color));
        });

        const spatialNeighbors = SpatialAnalysis.analyzeNeighbors(myPosition, userPositions, otherUsers, myUserId, myCellState);

        return {
            myPixelCount,
            neighborCount,
            colorCount: allColors.size,
            neighbors: otherUsers,
            spatialNeighbors: spatialNeighbors,
            spatialMap: SpatialAnalysis.buildSpatialMap(gridSize, myPosition, userPositions, myUserId)
        };
    }
};

// Export pour utilisation dans d'autres modules
export { SpatialAnalysis };
