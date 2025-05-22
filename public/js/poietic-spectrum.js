// poietic-mini-spectrum.js
class PoieticMiniSpectrum {
    constructor(container) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 60;    // Largeur d'une ligne de texte
        this.canvas.height = 8;    // Hauteur d'une ligne de texte
        this.canvas.style.display = 'inline-block';
        this.canvas.style.verticalAlign = 'middle';
        this.canvas.style.marginLeft = '4px';
        
        // 12 buckets pour les teintes (simplification maximale)
        this.colorBuckets = new Array(12).fill(0);
        this.ctx = this.canvas.getContext('2d');
        this.isDirty = false;
        this.updateInterval = 10000;
        this.lastUpdateTime = 0;
        
        container.appendChild(this.canvas);
        this.scheduleUpdate();
    }

    // Conversion rapide en index de teinte (0-11)
    getHueIndex(color) {
        // Conversion hex en RGB
        const r = parseInt(color.slice(1, 3), 16) / 255;
        const g = parseInt(color.slice(3, 5), 16) / 255;
        const b = parseInt(color.slice(5, 7), 16) / 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;
        
        let h = 0;
        if (d !== 0) {
            if (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
        }
        
        return Math.floor((h * 2) % 12);
    }

    addColor(color) {
        const index = this.getHueIndex(color);
        this.colorBuckets[index]++;
        this.isDirty = true;
    }

    removeColor(color) {
        const index = this.getHueIndex(color);
        if (this.colorBuckets[index] > 0) {
            this.colorBuckets[index]--;
            this.isDirty = true;
        }
    }

    scheduleUpdate() {
        if (!this.updateScheduled) {
            this.updateScheduled = true;
            requestAnimationFrame(() => this.update());
        }
    }

    update() {
        const now = Date.now();
        if (this.isDirty && now - this.lastUpdateTime >= this.updateInterval) {
            this.render();
            this.lastUpdateTime = now;
            this.isDirty = false;
        }
        this.updateScheduled = false;
        
        // Planifier la prochaine mise à jour
        setTimeout(() => this.scheduleUpdate(), this.updateInterval);
    }

    render() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Effacer le canvas
        ctx.clearRect(0, 0, width, height);
        
        // Trouver le maximum pour la normalisation
        const maxCount = Math.max(1, Math.max(...this.colorBuckets));
        
        // Largeur de chaque barre
        const barWidth = width / 12;
        
        // Dessiner chaque bucket
        this.colorBuckets.forEach((count, i) => {
            const hue = (i * 30) % 360; // 30° par teinte
            const h = (count / maxCount) * height;
            
            ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
            ctx.fillRect(
                i * barWidth,
                height - h,
                barWidth,
                h
            );
        });
    }

    reset() {
        this.colorBuckets.fill(0);
        this.isDirty = true;
        this.scheduleUpdate();
    }
}

// Utilisation dans le code existant
export function initializeMiniSpectrum(zone3c1) {
    const uniqueColorsLabel = zone3c1.querySelector('.stat-label:contains("Unique colors")');
    if (uniqueColorsLabel) {
        const spectrum = new PoieticMiniSpectrum(uniqueColorsLabel.parentElement);
        
        // Intégration avec le système existant
        return {
            updateColor: (color, isAdd) => {
                if (isAdd) {
                    spectrum.addColor(color);
                } else {
                    spectrum.removeColor(color);
                }
                spectrum.scheduleUpdate();
            },
            reset: () => spectrum.reset()
        };
    }
    return null;
}