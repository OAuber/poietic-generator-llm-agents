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

import { GeminiContextManager } from '../gemini-context-manager.js';
import { GeminiComplexityCalculator } from '../gemini-complexity-calculator.js';

const GeminiV2Adapter = {
    name: 'Gemini V2',
    version: '2025-01-24-055',
    apiKey: null,
    prompts: null,
    randomColors: [],
    modelsListed: false,
    
    // NEW: Memory and complexity managers
    contextManager: null,
    complexityCalculator: null,
    
    init() {
        console.log('🤖 [Gemini V2] Adapter initialisé - Version: 2025-01-24-016');
        
        // Initialize memory and complexity managers
        this.contextManager = new GeminiContextManager();
        this.complexityCalculator = new GeminiComplexityCalculator();
        
        console.log('📊 [Gemini V2] Context Manager et Complexity Calculator initialisés');
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

    async loadPrompts(promptType = 'all', useMemoryPrompt = true) {
        try {
            // Load memory-aware prompt by default
            const promptFile = useMemoryPrompt ? 'gemini-prompts-v2-memory.json' : 'gemini-prompts-v2-simple.json';
            const response = await fetch(`${promptFile}?v=${this.version}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const allPrompts = await response.json();
            
            if (promptType === 'all') {
                this.prompts = allPrompts;
                console.log(`📝 [Gemini V2] Tous les prompts chargés (${useMemoryPrompt ? 'avec mémoire' : 'simple'}):`, Object.keys(this.prompts));
            } else {
                // Load only the specific prompt needed
                this.prompts = { [promptType]: allPrompts[promptType] };
                console.log(`📝 [Gemini V2] Prompt chargé (${useMemoryPrompt ? 'avec mémoire' : 'simple'}):`, promptType);
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
    async buildSystemPrompt(analysis = {}, customPrompt, isFirstLlmRequest, manualContent, iterationCount, myLastStrategy, myRecentUpdates, myPosition, randomColors, lastLocalDescription, lastGlobalDescription) {
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

        // Inject complexity threshold placeholder
        try {
            const threshold = String(this.complexityThresholdWords || 50);
            systemPrompt = systemPrompt.replaceAll('{{complexityThreshold}}', threshold);
        } catch (_) {}

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
        
        // Replace colorPalette placeholder (if available in analysis)
        if (analysis && analysis.colorPalette) {
            systemPrompt = systemPrompt.replaceAll('{{colorPalette}}', analysis.colorPalette);
            console.log('🎨 [Gemini V2] ColorPalette injecté dans le prompt');
        }
        
        // Replace iteration placeholders
        systemPrompt = systemPrompt
            .replaceAll('{{i}}', iterationCount)
            .replaceAll('{{i-1}}', iterationCount - 1);
        console.log('🔢 [Gemini V2] Numéros d\'itération injectés: i=' + iterationCount + ', i-1=' + (iterationCount - 1));
        
        // Inject previous predictions from memory context
        if (this.contextManager && iterationCount > 0) {
            const previousIteration = iterationCount - 1;
            const prevData = this.contextManager.getIterationMetrics(previousIteration);
            
            if (prevData) {
                console.log('[Gemini V2] 🔍 Récupération prédictions itération précédente:', previousIteration);
                
                // Build memory context text
                let memoryContext = `\n\nMEMORY FROM ITERATION ${previousIteration}:\n`;
                memoryContext += `At iteration ${previousIteration}, you PREDICTED:\n`;
                memoryContext += `- Individual: "${prevData.predictions.individual_after || 'No prediction'}"\n`;
                memoryContext += `- Collective: "${prevData.predictions.collective_after || 'No prediction'}"\n`;
                
                // Add analysis of prediction accuracy if available
                if (prevData.descriptions && prevData.descriptions.predictability_individual) {
                    memoryContext += `\nPrediction accuracy (self-evaluation):\n`;
                    memoryContext += `- Individual predictability: ${prevData.descriptions.predictability_individual}/10\n`;
                    memoryContext += `- Collective predictability: ${prevData.descriptions.predictability_collective}/10\n`;
                }
                
                systemPrompt += memoryContext;
                console.log('[Gemini V2] 📊 Contexte mémoire injecté');
            }
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
                // Use only systemPrompt, don't add separate userMessage to avoid confusion
                requestBody.contents[0].parts.push({
                    text: systemPrompt
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
                    
                    // Return both content and usage information
                    return {
                        content: content,
                        usage: data.usageMetadata ? {
                            input_tokens: data.usageMetadata.promptTokenCount || 0,
                            output_tokens: data.usageMetadata.candidatesTokenCount || 0
                        } : (data.usage || { input_tokens: 0, output_tokens: 0 })
                    };
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
            
            // Remove JavaScript comments (// ...) from JSON - JSON doesn't support comments
            // Remove comments that appear on their own lines or after values
            jsonText = jsonText.replace(/\/\/.*$/gm, '');
            
            // Clean up: remove trailing commas before closing brackets/braces that might be left after comment removal
            jsonText = jsonText.replace(/,\s*([}\]])/g, '$1');
            
            // Remove empty lines
            jsonText = jsonText.replace(/^\s*[\r\n]/gm, '');
            
            console.log('🧹 [Gemini V2] JSON nettoyé:', jsonText.substring(0, 200) + '...');
            console.log('📏 [Gemini V2] Longueur JSON:', jsonText.length);
            console.log('📝 [Gemini V2] Fin JSON:', jsonText.slice(-100));
            
            
            // Check if JSON is truncated (doesn't end with })
            if (!jsonText.endsWith('}')) {
                console.warn('⚠️ [Gemini V2] JSON semble tronqué, tentative de réparation...');
                
                // Strategy 1: Find the last complete pixel string
                // Look for the last occurrence of ", or "\n before the truncation
                let truncatePosition = -1;
                
                // Find all complete pixels ending with ", (most common case)
                const lastCommaPixel = jsonText.lastIndexOf('",');
                if (lastCommaPixel > 0) {
                    // Cut right after the closing quote (before the comma)
                    truncatePosition = lastCommaPixel + 1;
                }
                
                // If no comma found, try to find pixels ending with newline
                if (truncatePosition < 0) {
                    const completePixelPattern = /"(\d+,\d+#[A-F0-9]{6})"\s*([\n\r\]])/g;
                    let match;
                    while ((match = completePixelPattern.exec(jsonText)) !== null) {
                        // Position after closing quote
                        truncatePosition = match.index + 1 + match[1].length + 1;
                    }
                }
                
                // Strategy 2: If we found a complete pixel, truncate there
                if (truncatePosition > 0) {
                    let truncated = jsonText.substring(0, truncatePosition);
                    
                    // Ensure it ends with a quote (should already, but double-check)
                    truncated = truncated.trimEnd();
                    if (!truncated.endsWith('"')) {
                        // Find the last quote
                        const lastQuote = truncated.lastIndexOf('"');
                        if (lastQuote > 0) {
                            truncated = truncated.substring(0, lastQuote + 1);
                        }
                    }
                    
                    truncated = truncated.trimEnd();
                    
                    // Verify: make sure we have a valid pixels array structure
                    // Find where the pixels array starts
                    const pixelsArrayStart = truncated.lastIndexOf('"pixels"');
                    if (pixelsArrayStart >= 0) {
                        const pixelsArrayBracket = truncated.indexOf('[', pixelsArrayStart);
                        if (pixelsArrayBracket >= 0) {
                            // We're good, close the array
                            jsonText = truncated + '\n    ]\n  }\n}';
                            console.log('🔧 [Gemini V2] JSON réparé (au dernier pixel complet)');
                        } else {
                            // No opening bracket found, something's wrong
                            jsonText = truncated + '\n    ]\n  }\n}';
                            console.log('🔧 [Gemini V2] JSON réparé (au dernier pixel, bracket manquant)');
                        }
                    } else {
                        // No pixels array found, just close descriptions
                        jsonText = truncated + '\n  }\n}';
                        console.log('🔧 [Gemini V2] JSON réparé (fermeture sans pixels array)');
                    }
                } else {
                    // Strategy 3: Look for incomplete pixel at the end
                    // Pattern could be: "1,12 or "1,12# or "1,12#AB
                    const trailingQuote = jsonText.match(/["][^"]*$/);
                    
                    if (trailingQuote && trailingQuote.index !== undefined) {
                        const incompleteStr = trailingQuote[0];
                        // Check if it looks like an incomplete pixel (starts with quote, has numbers and comma)
                        const pixelLikePattern = /^"(\d+,\d+)(#?[A-F0-9]{0,6})?$/;
                        const pixelMatch = incompleteStr.match(pixelLikePattern);
                        
                        if (pixelMatch) {
                            const hasHash = incompleteStr.includes('#');
                            const colorPart = hasHash ? incompleteStr.split('#')[1] : '';
                            
                            if (hasHash && colorPart && colorPart.length === 6) {
                                // Complete pixel found at end, just add closing quote
                                let truncated = jsonText.substring(0, trailingQuote.index + incompleteStr.length);
                                truncated = truncated.trimEnd();
                                if (!truncated.endsWith('"')) {
                                    truncated += '"';
                                }
                                if (truncated.endsWith(',')) {
                                    truncated = truncated.slice(0, -1).trimEnd();
                                }
                                jsonText = truncated + '\n    ]\n  }\n}';
                                console.log('🔧 [Gemini V2] JSON réparé (pixel complet trouvé à la fin)');
                            } else {
                                // Incomplete pixel, remove it and find last complete pixel
                                let truncated = jsonText.substring(0, trailingQuote.index);
                                truncated = truncated.trimEnd();
                                
                                // Find the last complete pixel (ends with ", or newline)
                                const lastCompletePixel = truncated.lastIndexOf('",');
                                if (lastCompletePixel > 0) {
                                    truncated = truncated.substring(0, lastCompletePixel + 2); // Include the ",
                                    truncated = truncated.trimEnd();
                                    if (truncated.endsWith(',')) {
                                        truncated = truncated.slice(0, -1).trimEnd();
                                    }
                                    jsonText = truncated + '\n    ]\n  }\n}';
                                    console.log('🔧 [Gemini V2] JSON réparé (pixel incomplet supprimé)');
                                } else {
                                    // No complete pixels found, close array empty or with what we have
                                    if (truncated.includes('"pixels":')) {
                                        jsonText = truncated + '\n    ]\n  }\n}';
                                        console.log('🔧 [Gemini V2] JSON réparé (fermeture array pixels vide)');
                                    } else {
                                        jsonText = truncated + '\n  }\n}';
                                        console.log('🔧 [Gemini V2] JSON réparé (fermeture sans pixels)');
                                    }
                                }
                            }
                        } else {
                            // Strategy 4: Find last valid JSON structure before truncation
                            const lastQuote = jsonText.lastIndexOf('"');
                            if (lastQuote > 0) {
                                const beforeQuote = jsonText.substring(0, lastQuote);
                                // Check if we're in a pixels array context
                                if (beforeQuote.includes('"pixels"') || beforeQuote.includes('"pixels":')) {
                                    let truncated = jsonText.substring(0, lastQuote + 1);
                                    truncated = truncated.trimEnd();
                                    if (truncated.endsWith(',')) {
                                        truncated = truncated.slice(0, -1).trimEnd();
                                    }
                                    jsonText = truncated + '\n    ]\n  }\n}';
                                    console.log('🔧 [Gemini V2] JSON réparé (dernière quote dans pixels)');
                                } else {
                                    // Not in pixels, just close descriptions and root
                                    let truncated = jsonText.substring(0, lastQuote + 1);
                                    truncated = truncated.trimEnd();
                                    jsonText = truncated + '\n  }\n}';
                                    console.log('🔧 [Gemini V2] JSON réparé (fermeture descriptions)');
                                }
                            } else {
                                // Last resort: just add closing braces
                                jsonText = jsonText.trimEnd() + '\n  }\n}';
                                console.log('🔧 [Gemini V2] JSON réparé (fermeture d\'urgence)');
                            }
                        }
                    } else {
                        // No trailing quote found, fallback to Strategy 4
                        const lastQuote = jsonText.lastIndexOf('"');
                        if (lastQuote > 0) {
                            const beforeQuote = jsonText.substring(0, lastQuote);
                            if (beforeQuote.includes('"pixels"') || beforeQuote.includes('"pixels":')) {
                                let truncated = jsonText.substring(0, lastQuote + 1);
                                truncated = truncated.trimEnd();
                                if (truncated.endsWith(',')) {
                                    truncated = truncated.slice(0, -1).trimEnd();
                                }
                                jsonText = truncated + '\n    ]\n  }\n}';
                                console.log('🔧 [Gemini V2] JSON réparé (dernière quote, fallback)');
                            } else {
                                jsonText = jsonText.trimEnd() + '\n  }\n}';
                                console.log('🔧 [Gemini V2] JSON réparé (fermeture d\'urgence, fallback)');
                            }
                        } else {
                            jsonText = jsonText.trimEnd() + '\n  }\n}';
                            console.log('🔧 [Gemini V2] JSON réparé (fermeture d\'urgence finale)');
                        }
                    }
                }
            }
            
            // Final cleanup: remove any trailing content that might interfere with parsing
            // This handles cases where the JSON might have extra characters after our repair
            jsonText = jsonText.trimEnd();
            
            // Count closing braces to ensure we have a complete JSON structure
            // Find the last valid closing brace for the root object
            const lastRootBrace = jsonText.lastIndexOf('}');
            if (lastRootBrace > 0) {
                // Keep everything up to and including the last }
                jsonText = jsonText.substring(0, lastRootBrace + 1);
            }
            
            // Remove any trailing whitespace or invalid characters
            jsonText = jsonText.trimEnd();
            
            // Try parsing - if it fails, try to fix by removing trailing content
            let parsed;
            try {
                parsed = JSON.parse(jsonText);
            } catch (parseError) {
                // Last resort: find the last valid JSON structure
                console.warn('⚠️ [Gemini V2] Parse échoué, tentative de nettoyage supplémentaire...');
                // Try to find the last complete object by counting braces
                let braceCount = 0;
                let lastValidPos = jsonText.length;
                for (let i = jsonText.length - 1; i >= 0; i--) {
                    if (jsonText[i] === '}') braceCount++;
                    if (jsonText[i] === '{') {
                        braceCount--;
                        if (braceCount === 0) {
                            lastValidPos = i;
                            break;
                        }
                    }
                }
                jsonText = jsonText.substring(0, lastValidPos) + '}';
                try {
                    parsed = JSON.parse(jsonText);
                } catch (e2) {
                    // Fallback reconstruction: extract descriptions and valid pixels via regex
                    const descMatch = jsonText.match(/"descriptions"\s*:\s*\{[\s\S]*?\}/);
                    let descriptionsObj = {};
                    if (descMatch) {
                        try {
                            descriptionsObj = JSON.parse('{'+descMatch[0]+'}'.replace(/^\{?"descriptions"\s*:\s*/,'').replace(/\}$/,''));
                        } catch(_) { descriptionsObj = {}; }
                    }
                    const pixelMatches = [...jsonText.matchAll(/"(\d+,\d+#[A-Fa-f0-9]{6})"/g)].map(m => m[1]);
                    const uniquePixels = Array.from(new Set(pixelMatches));
                    parsed = { descriptions: descriptionsObj, pixels: uniquePixels };
                }
            }
            console.log('🔍 [Gemini V2] JSON parsé:', parsed);
            
            // NOUVEAU FORMAT: Utiliser le champ "pixels" directement (format réduit)
            if (!parsed.pixels || !Array.isArray(parsed.pixels)) {
                console.error('❌ [Gemini V2] pixels manquant ou invalide:', parsed);
                throw new Error('Format de réponse invalide: pixels manquant');
            }
            
            console.log('✅ [Gemini V2] pixels trouvé:', parsed.pixels.length, 'pixels');

            // Valider et formater les pixels
            const pixels = [];
            for (const pixelStr of parsed.pixels) {
                if (typeof pixelStr === 'string' && pixelStr.includes('#') && pixelStr.includes(',')) {
                    const [coords, color] = pixelStr.split('#');
                    const [x, y] = coords.split(',');
                    const xNum = parseInt(x, 10);
                    const yNum = parseInt(y, 10);
                    
                    // Validate coordinates
                    if (!isNaN(xNum) && !isNaN(yNum) && xNum >= 0 && xNum <= 19 && yNum >= 0 && yNum <= 19) {
                        pixels.push(pixelStr);
                    } else {
                        console.warn(`⚠️ [Gemini V2] Coordonnées invalides ignorées: ${pixelStr}`);
                    }
                } else {
                    console.warn(`⚠️ [Gemini V2] Pixel invalide ignoré: ${pixelStr}`);
                }
            }

            console.log('✅ [Gemini V2] pixels prêtes:', pixels.length, 'pixels');
            
            return {
                pixels: pixels,  // Tableau de strings "x,y#HEX"
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
     * Extract descriptions from parsed response (NEW: memory-aware)
     */
    extractDescriptions(parsedResponse) {
        const descriptions = parsedResponse.descriptions || {};
        
        return {
            // Descriptions de l'état AVANT (pour calcul U)
            individualBeforeDescription: descriptions.individual_before_description || '',
            collectiveBeforeDescription: descriptions.collective_before_description || '',
            
            // Prédictions de l'évolution FUTURE
            individualAfterPrediction: descriptions.individual_after_prediction || '',
            collectiveAfterPrediction: descriptions.collective_after_prediction || '',
            
            // Prévisibilités (0-10)
            predictabilityIndividual: descriptions.predictability_individual || 0,
            predictabilityCollective: descriptions.predictability_collective || 0
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
            const responseData = await this.callGeminiAPI(systemMessage, '', imageBase64);
            console.log('✅ [Gemini V2] callGeminiAPI terminé, réponse:', responseData ? 'reçue' : 'vide');
            
            // Extract content and usage from response
            const responseText = responseData.content;
            const usage = responseData.usage;
            
            // Parse the JSON response and return structured object
            console.log('🔍 [Gemini V2] Parsing de la réponse...');
            const parsed = this.parseResponse(responseText);
            console.log('✅ [Gemini V2] Résultat parsé:', {
                pixelsCount: parsed.pixels.length,
                hasDescriptions: !!parsed.descriptions
            });
            
            // Return parsed object with usage information for ai-player.js
            return {
                ...parsed,
                usage: usage
            };

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