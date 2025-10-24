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
    version: '20250123-021',
    apiKey: null,
    prompts: null,
    randomColors: [],
    modelsListed: false,
    
    init() {
        console.log('🤖 [Gemini V2] Adapter initialisé');
    },

    /**
     * Load prompts from JSON file with cache busting
     */
    async loadPrompts() {
        try {
            const response = await fetch(`gemini-prompts-v2.json?v=${this.version}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            this.prompts = await response.json();
            console.log('📝 [Gemini V2] Prompts chargés:', Object.keys(this.prompts));
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
     * Generate random colors for placeholders
     */
    generateRandomColors(count = 12) {
        const colors = [];
        for (let i = 0; i < count; i++) {
            const r = Math.floor(Math.random() * 256);
            const g = Math.floor(Math.random() * 256);
            const b = Math.floor(Math.random() * 256);
            colors.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);
        }
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
        // For Gemini, we use a simplified approach
        // Load prompts if not already loaded
        if (!this.prompts) {
            const loaded = await this.loadPrompts();
            if (!loaded) {
                throw new Error('Impossible de charger les prompts Gemini');
            }
        }

        // Use seed_system for first request, continuation_system otherwise
        let promptTemplate;
        if (iterationCount === 0) {
            promptTemplate = this.prompts.seed_system;
        } else {
            promptTemplate = this.prompts.continuation_system;
        }

        // Generate random colors for placeholders
        this.randomColors = this.generateRandomColors(12);
        
        // Replace color placeholders with random colors
        let systemPrompt = promptTemplate;
        for (let i = 1; i <= this.randomColors.length; i++) {
            const placeholder = `{{color${i}}}`;
            const color = this.randomColors[i - 1];
            systemPrompt = systemPrompt.replace(new RegExp(placeholder, 'g'), color);
        }

        // Add custom prompt if provided
        if (customPrompt && customPrompt.trim()) {
            systemPrompt += `\n\nCUSTOM INSTRUCTION: ${customPrompt}`;
        }

        console.log('🎨 [Gemini V2] System prompt construit');
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
                const apiUrl = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent`;
                
                // Prepare request body
                const requestBody = {
                    contents: [{
                        parts: []
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 8000
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
            
            if (!parsed.drawing_actions || !Array.isArray(parsed.drawing_actions)) {
                throw new Error('Format de réponse invalide: drawing_actions manquant');
            }

            // Convert drawing_actions to x,y#HEX format
            const pixels = [];
            for (const action of parsed.drawing_actions) {
                if (action.x !== undefined && action.y !== undefined && action.hex_color) {
                    // Validate coordinates
                    if (action.x >= 0 && action.x <= 19 && action.y >= 0 && action.y <= 19) {
                        // Ensure hex_color has # prefix
                        const hexColor = action.hex_color.startsWith('#') ? action.hex_color.substring(1) : action.hex_color;
                        pixels.push(`${action.x},${action.y}#${hexColor}`);
                    } else {
                        console.warn(`⚠️ [Gemini V2] Coordonnées invalides ignorées: ${action.x},${action.y}`);
                    }
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
                const loaded = await this.loadPrompts();
                if (!loaded) {
                    throw new Error('Impossible de charger les prompts Gemini');
                }
            }

            // Call Gemini API
            const responseText = await this.callGeminiAPI(systemMessage, userMessage, imageBase64);
            
            // Return raw response text for ai-player.js to parse
            return responseText;

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