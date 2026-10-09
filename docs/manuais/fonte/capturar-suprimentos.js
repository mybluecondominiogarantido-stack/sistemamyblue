'use strict';
/*
 * Telas do Controle de Pedidos (Suprimentos) para o manual, com pedidos fictícios.
 * O HTML da ferramenta não fica no repositório: passe o caminho do arquivo "sem planilha".
 *
 *   LANG=pt_BR.UTF-8 node docs/manuais/fonte/capturar-suprimentos.js <ferramenta.html> <pasta-de-saída>
 *
 * Sobe um portal próprio (porta 3994, banco temporário). Converta as telas para JPEG em fonte/img.
 */
const path=require('path'),fs=require('fs'),{execSync,spawn}=require('child_process');
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const B='http://localhost:3994'; const HTML=process.argv[2]; const OUT=process.argv[3]; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync(OUT,{recursive:true});
(async()=>{
  const dd=require('os').tmpdir()+'/portal-manual-suprimentos'; fs.rmSync(dd,{recursive:true,force:true});
  const srv=spawn('node',['server/index.js'],{cwd:path.join(__dirname,'..','..','..'),env:{...process.env,DATA_DIR:dd,ADMIN_SENHA:'Admin1234',PORT:'3994'},stdio:['ignore','ignore','inherit']});
  try{
  for(let i=0;i<80;i++){try{if((await fetch(B+'/saude')).ok)break;}catch{} await sleep(500);}
  let cookie=''; const api=async(m,u,b,h={})=>{const r=await fetch(B+u,{method:m,headers:{cookie,...h},body:b});const sc=r.headers.get('set-cookie');if(sc)cookie=sc.split(';')[0];return r.text()};
  await api('POST','/api/auth/login',JSON.stringify({email:'admin@myblue.com.br',senha:'Admin1234'}),{'content-type':'application/json'});
  console.log('upload', (await api('PUT','/api/admin/modulos/suprimentos/arquivo',fs.readFileSync(HTML),{'content-type':'text/html'})).slice(0,120));
  const d=(n)=>{const x=new Date(Date.now()+n*864e5);return String(x.getDate()).padStart(2,'0')+'/'+String(x.getMonth()+1).padStart(2,'0')+'/'+x.getFullYear();};
  const rows=[
    ['1021','Papelaria Central — material de escritório','R$ 486,90','Boleto','1/1',d(-6),'Pago'],
    ['1022','TechNet — manutenção de impressoras','R$ 1.250,00','Boleto','1/1',d(-2),'Em aberto'],
    ['1023','Limpa Bem — produtos de limpeza','R$ 732,40','PIX','1/1',d(3),'Em aberto'],
    ['1025','Café Bom — café e copos','R$ 215,00','Cartão','1/1',d(10),'Em aberto'],
  ];
  console.log('addMany', await api('POST','/api/gas/suprimentos',JSON.stringify({action:'addMany',rows}),{'content-type':'text/plain','origin':B}));
  const b=await chromium.launch({channel:'chromium',args:['--lang=pt-BR']}); const ctx=await b.newContext({viewport:{width:1280,height:800},deviceScaleFactor:2,locale:'pt-BR'}); const p=await ctx.newPage();
  const erros=[]; p.on('pageerror',e=>erros.push(e.message));
  await p.goto(B+'/login'); await p.fill('#email','admin@myblue.com.br'); await p.fill('#senha','Admin1234'); await p.click('#btEntrar'); await sleep(1200);
  await p.goto(B+'/m/suprimentos/'); await sleep(4000);
  // pedido parcelado lançado pela tela
  await p.click('#newBtn'); await sleep(700);
  await p.fill('#f_num','1026'); await p.fill('#f_valor','2.700,00'); await p.fill('#f_desc','Móveis Sul — cadeiras (3x)');
  await p.click('text=Em várias vezes'); await sleep(500);
  const parc = await p.$('#f_parc, #f_parcelas, input[type=number]'); if (parc) { await parc.fill('3'); await parc.dispatchEvent('input'); await parc.dispatchEvent('change'); await sleep(500); }
  await p.screenshot({path:OUT+'/sup-3-parcelado.png'});
  await p.click('#saveBtn'); await sleep(1500);
  await p.screenshot({path:OUT+'/sup-1-pedidos.png'});
  for (const [aba, nome] of [['Pedidos do mês','sup-4-mes'],['Janelas de pagamento','sup-5-janelas']]) {
    await p.click('button:has-text("'+aba+'")'); await sleep(900); await p.screenshot({path:OUT+'/'+nome+'.png'});
    console.log(aba+':', (await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').slice(0,500));
  }
  console.log('erros',erros); await b.close();
  }finally{srv.kill();}
})().catch(e=>{console.error(e);process.exit(1)});
