// Test du parser reconstruit
import { LlavaAdapter } from './public/js/llm-adapters/llava.js';

// Test 1: Code blocks
const test1 = `
Here are my answers:
**Q1:** YES
**Q2:** My bot's grid is at position [1,0] with gray border
**Q3:** Global canvas shows multiple grids with various patterns
**Q4:** N: Empty, S: Colorful patterns, E: Geometric shapes
**Q5:** I want to create a blue square with orange center

\`\`\`pixels:
5,5#ff69b4 6,5#33cc33 7,5#9966cc 8,5#00cc66
5,6#ff69b4 6,6#33cc33 7,6#9966cc 8,6#00cc66
5,7#ff69b4 6,7#33cc33 7,7#9966cc 8,7#00cc66
\`\`\`
`;

// Test 2: Placeholders
const test2 = `
pixels: 1,1#{{color1}} 2,1#{{color2}} 3,1#{{color3}} 4,1#{{color4}}
`;

// Test 3: Coordonnées invalides
const test3 = `
pixels: 5,5#ff0000 20,5#00ff00 5,20#0000ff 19,19#ffff00
`;

console.log('🧪 Test 1: Code blocks');
const result1 = LlavaAdapter.parseCompactFormat(test1);
console.log('Pixels trouvés:', result1?.pixels?.length || 0);
console.log('Q1:', result1?.q1_images_received);
console.log('Q5:', result1?.q5_my_intention);

console.log('\n🧪 Test 2: Placeholders');
const result2 = LlavaAdapter.parseCompactFormat(test2);
console.log('Pixels trouvés:', result2?.pixels?.length || 0);
if (result2?.pixels) {
    result2.pixels.forEach(p => console.log(`  ${p.x},${p.y}: ${p.color}`));
}

console.log('\n🧪 Test 3: Coordonnées invalides');
const result3 = LlavaAdapter.parseCompactFormat(test3);
console.log('Pixels valides:', result3?.pixels?.length || 0);
if (result3?.pixels) {
    result3.pixels.forEach(p => console.log(`  ${p.x},${p.y}: ${p.color}`));
}
