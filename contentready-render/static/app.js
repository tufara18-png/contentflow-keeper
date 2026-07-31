const audioFile = document.querySelector('#audioFile');
const audio = document.querySelector('#audio');
const wave = document.querySelector('#wave');
const ctx = wave.getContext('2d');
const startRange = document.querySelector('#startRange');
const startLabel = document.querySelector('#startLabel');
const wordsBody = document.querySelector('#wordsBody');
const statusEl = document.querySelector('#status');
let audioBuffer = null;
let words = [];
let beats = [];
let stopTimer = null;

function setStatus(text){ statusEl.textContent = text; }
function currentStart(){ return Number(startRange.value || 0); }
function renderWords(){
  wordsBody.innerHTML = '';
  words.forEach((w, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input data-k="word" value="${String(w.word ?? '').replaceAll('"','&quot;')}"></td>
      <td><input data-k="time" type="number" min="0" max="15" step="0.01" value="${w.time ?? 0}"></td>
      <td><input data-k="end" type="number" min="0" max="15" step="0.01" value="${w.end ?? 0}"></td>
      <td><input data-k="line_idx" type="number" min="0" step="1" value="${w.line_idx ?? 0}"></td>
      <td><button data-del="1">×</button></td>`;
    tr.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
      const k = inp.dataset.k;
      words[i][k] = k === 'word' ? inp.value : Number(inp.value);
    }));
    tr.querySelector('[data-del]').addEventListener('click', () => { words.splice(i,1); renderWords(); });
    wordsBody.appendChild(tr);
  });
}

function drawWave(){
  ctx.clearRect(0,0,wave.width,wave.height);
  ctx.fillStyle='#090a0b';ctx.fillRect(0,0,wave.width,wave.height);
  if(!audioBuffer) return;
  const data=audioBuffer.getChannelData(0); const step=Math.ceil(data.length/wave.width); const amp=wave.height/2;
  ctx.strokeStyle='#9aa3a8';ctx.beginPath();
  for(let x=0;x<wave.width;x++){
    let min=1,max=-1; const off=x*step;
    for(let j=0;j<step && off+j<data.length;j++){const v=data[off+j]; if(v<min)min=v;if(v>max)max=v;}
    ctx.moveTo(x,(1+min)*amp);ctx.lineTo(x,(1+max)*amp);
  }
  ctx.stroke();
  const dur=audioBuffer.duration; const x=(currentStart()/dur)*wave.width; const w=(15/dur)*wave.width;
  ctx.fillStyle='rgba(139,255,0,.22)';ctx.fillRect(x,0,w,wave.height);
  ctx.strokeStyle='#8bff00';ctx.lineWidth=2;ctx.strokeRect(x,1,w,wave.height-2);
}

audioFile.addEventListener('change', async () => {
  const file=audioFile.files[0]; if(!file) return;
  audio.src=URL.createObjectURL(file);
  const ac=new AudioContext(); audioBuffer=await ac.decodeAudioData(await file.arrayBuffer());
  startRange.max=Math.max(0,audioBuffer.duration-15); startRange.value=0; startLabel.textContent='0.00'; drawWave();
});
startRange.addEventListener('input',()=>{startLabel.textContent=currentStart().toFixed(2);drawWave();});
wave.addEventListener('click',e=>{ if(!audioBuffer)return; const r=wave.getBoundingClientRect(); const ratio=(e.clientX-r.left)/r.width; startRange.value=Math.min(Number(startRange.max),Math.max(0,ratio*audioBuffer.duration-7.5)); startRange.dispatchEvent(new Event('input'));});
document.querySelector('#playSelection').addEventListener('click',()=>{if(!audio.src)return;clearTimeout(stopTimer);audio.currentTime=currentStart();audio.play();stopTimer=setTimeout(()=>audio.pause(),15000);});

document.querySelector('#analyze').addEventListener('click', async e => {
  const file=audioFile.files[0]; if(!file) return alert('Choisis le morceau.');
  const btn=e.currentTarget;btn.disabled=true;setStatus('Upload, séparation Demucs et transcription… le premier lancement peut être long.');
  const fd=new FormData();fd.append('audio',file);fd.append('start',currentStart());
  try{
    const res=await fetch('/api/analyze',{method:'POST',body:fd}); const data=await res.json();
    if(!res.ok) throw new Error(data.detail||'Erreur analyse');
    words=data.words||[];beats=data.beats||[];renderWords();setStatus(`${words.length} mots et ${beats.length} beats détectés.`);
  }catch(err){setStatus(`Erreur : ${err.message}`);}finally{btn.disabled=false;}
});
document.querySelector('#addWord').addEventListener('click',()=>{words.push({word:'mot',time:0,end:.5,line_idx:0,word_idx:0});renderWords();});

document.querySelector('#render').addEventListener('click', async e => {
  const file=audioFile.files[0]; const clipFiles=[...document.querySelector('#clips').files];
  if(!file||!clipFiles.length)return alert('Ajoute le morceau et au moins une vidéo.');
  const btn=e.currentTarget;btn.disabled=true;setStatus('Rendu FFmpeg en cours…');
  const fd=new FormData();fd.append('audio',file);clipFiles.forEach(c=>fd.append('clips',c));fd.append('start',currentStart());fd.append('words_json',JSON.stringify(words));fd.append('beats_json',JSON.stringify(beats));fd.append('seed',document.querySelector('#seed').value);fd.append('grain',document.querySelector('#grain').value);
  try{
    const res=await fetch('/api/render',{method:'POST',body:fd}); if(!res.ok){const d=await res.json();throw new Error(d.detail||'Erreur rendu');}
    const blob=await res.blob(); const url=URL.createObjectURL(blob); const a=document.querySelector('#download');a.href=url;a.download='contentready-brat-15s.mp4';a.hidden=false;a.textContent='Télécharger la vidéo';setStatus('Rendu terminé.');
  }catch(err){setStatus(`Erreur : ${err.message}`);}finally{btn.disabled=false;}
});
