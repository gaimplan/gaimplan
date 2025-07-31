#!/usr/bin/env node

import { pipeline, env } from '@xenova/transformers';

env.allowRemoteModels = true;
env.localURL = './models';

async function quickDemo() {
  console.log('🔬 Quick Demonstration: Nomic vs Current Default');
  console.log('================================================');
  
  const current = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  const nomic = await pipeline('feature-extraction', 'nomic-ai/nomic-embed-text-v1.5');
  
  const testText = 'Machine learning enables intelligent applications';
  
  console.log(`Test text: "${testText}"`);
  console.log('');
  
  // Current model
  const currentStart = Date.now();
  const currentOut = await current(testText, { pooling: 'mean', normalize: true });
  const currentTime = Date.now() - currentStart;
  const currentEmb = Array.from(currentOut.data);
  
  console.log('Current Default (Xenova/all-MiniLM-L6-v2):');
  console.log(`  Time: ${currentTime}ms`);
  console.log(`  Dimension: ${currentEmb.length}`);
  console.log(`  Sample: [${currentEmb.slice(0, 3).map(v => v.toFixed(4)).join(', ')}, ...]`);
  console.log(`  Norm: ${Math.sqrt(currentEmb.reduce((s,v) => s + v*v, 0)).toFixed(6)}`);
  
  // Nomic model  
  const nomicStart = Date.now();
  const nomicOut = await nomic(testText, { pooling: 'mean', normalize: true });
  const nomicTime = Date.now() - nomicStart;
  const nomicEmb = Array.from(nomicOut.data);
  
  console.log('');
  console.log('Nomic AI (nomic-ai/nomic-embed-text-v1.5):');
  console.log(`  Time: ${nomicTime}ms`);
  console.log(`  Dimension: ${nomicEmb.length}`);
  console.log(`  Sample: [${nomicEmb.slice(0, 3).map(v => v.toFixed(4)).join(', ')}, ...]`);
  console.log(`  Norm: ${Math.sqrt(nomicEmb.reduce((s,v) => s + v*v, 0)).toFixed(6)}`);
  
  console.log('');
  console.log('Comparison:');
  console.log(`  Speed ratio: ${(nomicTime / currentTime).toFixed(2)}x`);
  console.log(`  Dimension ratio: ${(nomicEmb.length / currentEmb.length).toFixed(2)}x`);
  console.log(`  Memory ratio: ${((nomicEmb.length * 4) / (currentEmb.length * 4)).toFixed(2)}x`);
  
  console.log('');
  console.log('✅ Both models working successfully with Transformers.js!');
}

quickDemo().catch(console.error);