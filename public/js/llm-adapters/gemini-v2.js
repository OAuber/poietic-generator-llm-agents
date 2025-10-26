/**
 * Gemini V2 Adapter - Vision-Language Model for Collaborative Drawing
 * 
 * This adapter communicates with Google's Gemini Flash API to:
 * - Analyze canvas images (collective and individual grids)
 * - Generate structured JSON responses with drawing actions
 * - Provide descriptions of current and predicted states
 * 
 * Version: v=20250123-007
 * Compatible with: ai-player-v2.html
 */

const GeminiV2Adapter = {
    name: 'Gemini V2',
    version: '2025-01-24-016',
    apiKey: null,
    prompts: null,
    randomColors: [],
    modelsListed: false,
    
    init() {
        console.log('🤖 [Gemini V2] Adapter initialisé - Version: 2025-01-24-013');
    },

    /**
     * Get position description for coordinates
     */
    getPositionDescription(x, y) {
        if (x === 0 && y === 0) return 'at the CENTER';
        if (x === 0) return y > 0 ? 'SOUTH' : 'NORTH';
        if (y === 0) return x > 0 ? 'EAST' : 'WEST';
        if (x > 0 && y > 0) return 'SOUTHEAST';
        if (x > 0 && y < 0) return 'NORTHEAST';
        if (x < 0 && y > 0) return 'SOUTHWEST';
        if (x < 0 && y < 0) return 'NORTHWEST';
        return 'at an unknown position';
    },

    async loadPrompts(promptType = 'all') {
        try {
            const response = await fetch(`gemini-prompts-v2-simple.json?v=${this.version}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const allPrompts = await response.json();
            
            if (promptType === 'all') {
                this.prompts = allPrompts;
                console.log('📝 [Gemini V2] Tous les prompts chargés:', Object.keys(this.prompts));
            } else {
                // Load only the specific prompt needed
                this.prompts = { [promptType]: allPrompts[promptType] };
                console.log('📝 [Gemini V2] Prompt chargé:', promptType);
            }
            
            return this.prompts;
        } catch (error) {
            console.error('❌ [Gemini V2] Erreur chargement prompts:', error);
            return null;
        }
    },

    /**
     * Get API key from localStorage or prompt user
     */
    getApiKey() {
        // Always check localStorage first
        const storedKey = localStorage.getItem('gemini_api_key');
        if (storedKey && storedKey.trim()) {
            this.apiKey = storedKey.trim();
            return storedKey.trim();
        }
        
        // If we have a stored key in this.apiKey, use it
        if (this.apiKey && this.apiKey.trim()) {
            return this.apiKey.trim();
        }
        
        // Prompt user for API key only if none found
        const userKey = prompt('🔑 Entrez votre NOUVELLE clé API Gemini:\n\n1. Allez sur Google Cloud Console\n2. Activez "Generative Language API"\n3. Créez une nouvelle clé API\n4. Collez-la ici');
        if (userKey && userKey.trim()) {
            this.apiKey = userKey.trim();
            localStorage.setItem('gemini_api_key', this.apiKey);
            return this.apiKey;
        }
        
        return null;
    },

    /**
     * Clear stored API key (for troubleshooting)
     */
    clearApiKey() {
        localStorage.removeItem('gemini_api_key');
        this.apiKey = null;
        console.log('🗑️ [Gemini V2] Clé API effacée');
    },

    /**
     * List available models (as suggested by Gemini error message)
     */
    async listAvailableModels() {
        try {
            const apiKey = this.getApiKey();
            const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('📋 [Gemini V2] Modèles disponibles:', data);
            
            if (data.models) {
                const modelNames = data.models
                    .filter(model => model.supportedGenerationMethods && 
                                   model.supportedGenerationMethods.includes('generateContent'))
                    .map(model => model.name.replace('models/', ''));
                
                console.log('✅ [Gemini V2] Modèles supportant generateContent:', modelNames);
                return modelNames;
            }
            
            return [];
        } catch (error) {
            console.error('❌ [Gemini V2] Erreur listAvailableModels:', error);
            return [];
        }
    },

    /**
     * Generate random colors for placeholders with better tonal variety
     */
    generateRandomColors(count = 12) {
        const colors = [];
        
        // Generate a mix of light, medium, and dark tones
        for (let i = 0; i < count; i++) {
            let r, g, b;
            
            // 30% chance for light colors (200-255)
            // 40% chance for medium colors (100-200)  
            // 30% chance for dark colors (0-100)
            const toneType = Math.random();
            
            if (toneType < 0.3) {
                // Light colors
                r = Math.floor(Math.random() * 56) + 200;
                g = Math.floor(Math.random() * 56) + 200;
                b = Math.floor(Math.random() * 56) + 200;
            } else if (toneType < 0.7) {
                // Medium colors
                r = Math.floor(Math.random() * 100) + 100;
                g = Math.floor(Math.random() * 100) + 100;
                b = Math.floor(Math.random() * 100) + 100;
            } else {
                // Dark colors
                r = Math.floor(Math.random() * 100);
                g = Math.floor(Math.random() * 100);
                b = Math.floor(Math.random() * 100);
            }
            
            colors.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);
        }
        
        console.log('🎨 [Gemini V2] Couleurs générées avec variété tonale:', colors);
        return colors;
    },

    /**
     * List available models for debugging
     */
    async listAvailableModels() {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('Clé API Gemini manquante');
        }

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('📋 [Gemini V2] Modèles disponibles:', data.models?.map(m => m.name) || 'Aucun');
            return data.models || [];
        } catch (error) {
            console.error('❌ [Gemini V2] Erreur listage modèles:', error);
            return [];
        }
    },

    /**
     * Build system prompt - compatibility method for ai-player.js
     */
    async buildSystemPrompt(analysis, customPrompt, isFirstLlmRequest, manualContent, iterationCount, myLastStrategy, myRecentUpdates, myPosition, randomColors, lastLocalDescription, lastGlobalDescription) {
        console.log('🔧 [Gemini V2] buildSystemPrompt appelé, iterationCount:', iterationCount);
        
        // For Gemini, we use a simplified approach

        // Use single system prompt for all requests
        const promptType = 'system';
        
        // Load the system prompt if not already loaded
        if (!this.prompts || !this.prompts[promptType]) {
            console.log('📥 [Gemini V2] Chargement du prompt:', promptType);
            const loaded = await this.loadPrompts(promptType);
            console.log('🔍 [Gemini V2] Prompt chargé:', loaded);
            if (!loaded) {
                throw new Error(`Impossible de charger le prompt ${promptType}`);
            }
        }
        
        console.log('✅ [Gemini V2] Prompt disponible:', promptType);
        console.log('🔍 [Gemini V2] Prompts disponibles:', Object.keys(this.prompts || {}));
        let promptTemplate = this.prompts[promptType];
        console.log('🔍 [Gemini V2] Prompt template:', promptTemplate);
        
        // Convert array to string if needed
        if (Array.isArray(promptTemplate)) {
            console.log('🔄 [Gemini V2] Conversion tableau -> chaîne');
            promptTemplate = promptTemplate.join('\n');
        }

        // Generate random colors for placeholders
        console.log('🎨 [Gemini V2] Génération des couleurs aléatoires...');
        this.randomColors = this.generateRandomColors(12);
        console.log('🎨 [Gemini V2] Couleurs générées:', this.randomColors.length);
        
        // Replace color placeholders with random colors
        console.log('🔄 [Gemini V2] Remplacement des placeholders...');
        let systemPrompt = promptTemplate;
        for (let i = 1; i <= this.randomColors.length; i++) {
            const placeholder = `{{color${i}}}`;
            const color = this.randomColors[i - 1];
            console.log(`🔄 [Gemini V2] Remplacement ${i}/${this.randomColors.length}: ${placeholder} -> ${color}`);
            systemPrompt = systemPrompt.replace(new RegExp(placeholder, 'g'), color);
        }
        console.log('✅ [Gemini V2] Placeholders remplacés');

        // Add custom prompt if provided
        if (customPrompt && customPrompt.trim()) {
            systemPrompt += `\n\nCUSTOM INSTRUCTION: ${customPrompt}`;
        }

        // Replace position placeholders
        if (myPosition) {
            const myX = myPosition[0];
            const myY = myPosition[1];
            const positionDescription = this.getPositionDescription(myX, myY);
            
            systemPrompt = systemPrompt
                .replaceAll('{{myX}}', myX)
                .replaceAll('{{myY}}', myY)
                .replaceAll('{{positionDescription}}', positionDescription);
        }
        
        console.log('🎨 [Gemini V2] System prompt construit, longueur:', systemPrompt.length);
        return {
            systemMessage: systemPrompt,
            userMessage: 'Analyze the image and provide your response in the specified JSON format.',
            needsImage: true,
            useGlobalCanvas: true
        };
    },

    /**
     * Call Gemini API with structured JSON response - tries multiple models
     */
    async callGeminiAPI(systemPrompt, userMessage, imageBase64 = null) {
        const timeout = 300000; // 5 minutes timeout
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('Clé API Gemini manquante');
        }

        console.log('🚀 [Gemini V2] Appel API avec Gemini...');
        console.log('📝 [Gemini V2] SystemPrompt length:', systemPrompt.length);
        console.log('📝 [Gemini V2] UserMessage length:', userMessage.length);
        console.log('🖼️ [Gemini V2] ImageBase64 length:', imageBase64 ? imageBase64.length : 'null');

        // Utiliser directement les modèles disponibles vus dans les logs
        const modelNames = [
            'gemini-2.5-flash',
            'gemini-2.5-pro',
            'gemini-2.0-flash',
            'gemini-flash-latest',
            'gemini-pro-latest'
        ];

        for (const modelName of modelNames) {
            try {
                console.log(`🔄 [Gemini V2] Essai avec modèle: ${modelName}`);
                console.log(`⏱️ [Gemini V2] Début de la requête...`);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    console.log(`⏰ [Gemini V2] Timeout atteint pour ${modelName}`);
                    controller.abort();
                }, timeout);
                
                const apiUrl = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent`;
                
                // Prepare request body
                const requestBody = {
                    contents: [{
                        parts: []
                    }],
                    generationConfig: {
                        temperature: 0.9,
                        maxOutputTokens: 12000
                    }
                };

                // Add text parts
                const fullPrompt = `${systemPrompt}\n\n${userMessage}`;
                requestBody.contents[0].parts.push({
                    text: fullPrompt
                });

                // Add image if provided
                if (imageBase64) {
                    // Ensure we have clean base64 data without data URL prefix
                    let cleanBase64 = imageBase64;
                    if (imageBase64.startsWith('data:image/png;base64,')) {
                        cleanBase64 = imageBase64.replace('data:image/png;base64,', '');
                    }
                    
                    console.log('🖼️ [Gemini V2] Image formatée:', {
                        originalLength: imageBase64.length,
                        cleanLength: cleanBase64.length,
                        startsWithDataUrl: imageBase64.startsWith('data:image/png;base64,'),
                        cleanStartsWithDataUrl: cleanBase64.startsWith('data:image/png;base64,')
                    });
                    
                    requestBody.contents[0].parts.push({
                        inline_data: {
                            mime_type: "image/png",
                            data: cleanBase64
                        }
                    });
                }

                console.log('📤 [Gemini V2] Corps de la requête:', {
                    contentsCount: requestBody.contents.length,
                    partsCount: requestBody.contents[0].parts.length,
                    hasText: requestBody.contents[0].parts.some(p => p.text),
                    hasImage: requestBody.contents[0].parts.some(p => p.inline_data),
                    generationConfig: requestBody.generationConfig
                });

                const response = await fetch(`${apiUrl}?key=${apiKey}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody)
                });
                
                console.log(`📡 [Gemini V2] Réponse reçue pour ${modelName}, status:`, response.status);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.log(`❌ [Gemini V2] Modèle ${modelName} échoué: HTTP ${response.status}`);
                    console.log(`❌ [Gemini V2] Erreur détaillée:`, errorText);
                    continue; // Try next model
                }

                const data = await response.json();
                console.log(`✅ [Gemini V2] Modèle ${modelName} réussi!`);
                console.log('📡 [Gemini V2] Réponse HTTP reçue, status:', response.status);
                console.log('📦 [Gemini V2] Données JSON parsées:', Object.keys(data));

                if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                    const content = data.candidates[0].content.parts[0].text;
                    console.log('📊 [Gemini V2] Réponse reçue:', content.length, 'caractères');
                    console.log('📝 [Gemini V2] Début de réponse:', content.substring(0, 200));
                    return content;
                } else {
                    console.error('❌ [Gemini V2] Structure de réponse invalide:', data);
                    throw new Error('Format de réponse Gemini invalide');
                }

            } catch (error) {
                console.log(`❌ [Gemini V2] Modèle ${modelName} erreur:`, error.message);
                
                // Si c'est un rate limit (429), relancer l'erreur pour gestion spéciale
                if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
                    throw new Error('Rate limit Gemini atteint - attendez quelques minutes');
                }
                
                continue; // Try next model
            }
        }

        throw new Error('Aucun modèle Gemini disponible avec cette clé API');
    },

    /**
     * Parse Gemini JSON response
     */
    parseResponse(responseText) {
        try {
            
            // Check if response is valid
            if (!responseText || responseText === 'undefined' || responseText.trim() === '') {
                throw new Error('Réponse vide ou undefined de Gemini');
            }
            
            // Nettoyer la réponse des backticks et markdown
            let jsonText = responseText.trim();
            
            // Supprimer les backticks de début et fin
            if (jsonText.startsWith('```json')) {
                jsonText = jsonText.replace(/^```json\s*/, '');
            }
            if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/^```\s*/, '');
            }
            if (jsonText.endsWith('```')) {
                jsonText = jsonText.replace(/\s*```$/, '');
            }
            
            // Supprimer les espaces et nouvelles lignes en début/fin
            jsonText = jsonText.trim();
            
            console.log('🧹 [Gemini V2] JSON nettoyé:', jsonText.substring(0, 200) + '...');
            console.log('📏 [Gemini V2] Longueur JSON:', jsonText.length);
            console.log('📝 [Gemini V2] Fin JSON:', jsonText.slice(-100));
            
            
            // Check if JSON is truncated (doesn't end with })
            if (!jsonText.endsWith('}')) {
                console.warn('⚠️ [Gemini V2] JSON semble tronqué, tentative de réparation...');
                
                // Try to find the last complete object in drawing_actions
                const lastCompleteAction = jsonText.lastIndexOf('}');
                if (lastCompleteAction > 0) {
                    // Find the end of the drawing_actions array
                    const drawingActionsEnd = jsonText.lastIndexOf(']');
                    if (drawingActionsEnd > lastCompleteAction) {
                        jsonText = jsonText.substring(0, drawingActionsEnd + 1) + '\n  }\n}';
                        console.log('🔧 [Gemini V2] JSON réparé');
                    }
                }
            }
            
            const parsed = JSON.parse(jsonText);
            console.log('🔍 [Gemini V2] JSON parsé:', parsed);
            
            if (!parsed.drawing_actions || !Array.isArray(parsed.drawing_actions)) {
                console.error('❌ [Gemini V2] drawing_actions manquant ou invalide:', parsed);
                throw new Error('Format de réponse invalide: drawing_actions manquant');
            }
            
            console.log('✅ [Gemini V2] drawing_actions trouvé:', parsed.drawing_actions.length, 'actions');

            // Convert drawing_actions to x,y#HEX format
            const pixels = [];
            for (const action of parsed.drawing_actions) {
                console.log('🔍 [Gemini V2] Action:', action);
                if (action.x !== undefined && action.y !== undefined && action.hex_color) {
                    // Validate coordinates
                    if (action.x >= 0 && action.x <= 19 && action.y >= 0 && action.y <= 19) {
                        // Ensure hex_color has # prefix and handle double hashes
                        let hexColor = action.hex_color;
                        if (hexColor.startsWith('##')) {
                            // Double hash: ##FF0000 -> FF0000
                            hexColor = hexColor.substring(2);
                        } else if (hexColor.startsWith('#')) {
                            // Single hash: #FF0000 -> FF0000
                            hexColor = hexColor.substring(1);
                        }
                        console.log(`🔧 [Gemini V2] Couleur corrigée: "${action.hex_color}" -> "${hexColor}"`);
                        pixels.push(`${action.x},${action.y}#${hexColor}`);
                    } else {
                        console.warn(`⚠️ [Gemini V2] Coordonnées invalides ignorées: ${action.x},${action.y}`);
                    }
                } else {
                    console.log(`⚠️ [Gemini V2] Action invalide - manque x/y/hex_color:`, action);
                }
            }

            console.log('✅ [Gemini V2] Pixels parsés:', pixels.length);
            
            return {
                pixels: pixels,
                descriptions: parsed.descriptions || {},
                rawResponse: responseText
            };

        } catch (error) {
            console.error('❌ [Gemini V2] Erreur parsing JSON:', error);
            console.log('📝 [Gemini V2] Réponse brute:', responseText);
            throw new Error('Réponse JSON invalide de Gemini');
        }
    },

    /**
     * Extract descriptions from parsed response
     */
    extractDescriptions(parsedResponse) {
        const descriptions = parsedResponse.descriptions || {};
        
        return {
            localDescription: descriptions.individual_after || 'Description locale non disponible',
            globalDescription: descriptions.collective_after_prediction || 'Description globale non disponible'
        };
    },

    /**
     * Main method called by ai-player.js
     */
    async callAPI(apiKey, systemMessage, userMessage, imageBase64) {
        try {
            // Store API key if provided
            if (apiKey) {
                this.apiKey = apiKey;
                localStorage.setItem('gemini_api_key', apiKey);
            }


            // Load prompts if not already loaded
            if (!this.prompts) {
                const loaded = await this.loadPrompts('all');
                if (!loaded) {
                    throw new Error('Impossible de charger les prompts Gemini');
                }
            }

            // Call Gemini API
            console.log('🚀 [Gemini V2] Appel à callGeminiAPI...');
            const responseText = await this.callGeminiAPI(systemMessage, userMessage, imageBase64);
            console.log('✅ [Gemini V2] callGeminiAPI terminé, réponse:', responseText ? 'reçue' : 'vide');
            
            // Parse the JSON response and return structured object
            console.log('🔍 [Gemini V2] Parsing de la réponse...');
            const parsed = this.parseResponse(responseText);
            console.log('✅ [Gemini V2] Résultat parsé:', {
                pixelsCount: parsed.pixels.length,
                hasDescriptions: !!parsed.descriptions
            });
            
            // Return parsed object for ai-player.js
            return parsed;

        } catch (error) {
            console.error('❌ [Gemini V2] Erreur callAPI:', error);
            throw error;
        }
    }
};

// Initialize the adapter
GeminiV2Adapter.init();

// Export for ES6 modules
export { GeminiV2Adapter };

// Export for global use (fallback) - expose as object, not class
window.GeminiV2Adapter = GeminiV2Adapter;