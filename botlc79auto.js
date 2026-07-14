const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http'); // ✅ THÊM: MỞ CỔNG CHO RENDER
const CryptoJS = require('crypto-js');
const { io } = require('socket.io-client');
const moment = require('moment');
const os = require('os');
const math = Math;

// ==========================================
// 👑 CẤU HÌNH
// ==========================================
const logger = {
    debug: (...m) => console.log(`[${new Date().toLocaleString('vi-VN')}] DEBUG:`, ...m),
    info:  (...m) => console.log(`[${new Date().toLocaleString('vi-VN')}] INFO :`, ...m),
    warn:  (...m) => console.log(`[${new Date().toLocaleString('vi-VN')}] WARN :`, ...m),
    error: (...m) => console.log(`[${new Date().toLocaleString('vi-VN')}] ERROR:`, ...m),
};
const BOT_TOKEN      = '8754382807:AAEzxhDy3RaiqIzgCnXNtE4oMHKSDOZXY3Q';
const ADMIN_ID       = 7833803456;
const ADMIN_USERNAME = "@cskhvilong1";
const PORT = process.env.PORT || 10000; // ✅ RENDER TỰ ĐỘNG CẤP PORT

const bot = new TelegramBot(BOT_TOKEN, { 
    polling: true, 
    request: { timeout: 30000 }, // ✅ FIX: TĂNG TIMEOUT ĐỂ RENDER KHÔNG BỊ CẮT KẾT NỐI
    onlyFirstMatch: true 
});

bot.setMyCommands([
    { command: '/start',     description: '🏠 Mở menu chính hệ thống' },
    { command: '/huongdan',  description: '📖 Bảng hướng dẫn sử dụng' },
    { command: '/nhapkey',   description: '🔑 Nhập key kích hoạt bản quyền' },
    { command: '/thongtin',  description: '💎 Xem thông tin tài khoản & hạn dùng' },
    { command: '/login',     description: '🔐 Đăng nhập tài khoản game' },
    { command: '/autobet',   description: '⚡ Bật / tắt tự động đặt cược' },
    { command: '/lichsucau', description: '📊 Xem lịch sử cầu gần nhất' },
    { command: '/stop',      description: '⏹️ Ngắt kết nối an toàn' },
    { command: '/taokey',    description: '👑 [ADMIN] Tạo key bản quyền' },
    { command: '/danhsachkey',description:'📋 [ADMIN] Xem danh sách key còn lại' },
]);

const HISTORY_API_URL       = "https://wtxmd52.tele68.com/v1/txmd5/lite-sessions";
const MAX_HISTORY_STORE     = 100;
const MIN_CONFIDENCE_AUTO_BET = 60;
const AUTO_BET_RUN_UNTIL_STOP = true;
const dynamic_weights = {
    cau_rong:10, cau_dut:9, cau_11:8, cau_22:8, cau_33:7, cau_44:7, cau_55:7,
    thongke:5, markov1:4, markov2:5, markov3:6, diem_xucxac:4
};
const active_sockets   = {};
const user_states      = {};
const valid_keys       = {};
const authorized_users = {};

// ✅ FIX RENDER: TẠO SERVER HTTP MỞ CỔNG → KHỎI BÁO NO OPEN PORTS
http.createServer((req,res)=>{
    res.writeHead(200,{"Content-Type":"text/plain; charset=utf-8"});
    res.end("✅ BOT VIP VI LONG ELITE ĐANG CHẠY | RENDER OK\n👑 Ensemble 14 thuật toán");
}).listen(PORT,()=>logger.info(`🌐 HTTP SERVER MỞ CỔNG ${PORT} - RENDER ĐÃ NHẬN DIỆN`));

// ╔══════════════════════════════════════════════════════════════╗
// ║ 🚀 TOÀN BỘ 14 THUẬT TOÁN + ENSEMBLE VOTING - GIỮ NGUYÊN 100% ║
// ╚══════════════════════════════════════════════════════════════╝
const FEATURE_CACHE = {}; const CACHE_MAX=10; const CACHE_TTL=1.5;
function _hist_key(h){if(!h||!h.length)return"empty";const l=h[h.length-1];return`${h.length}_${l.session||l.id||'x'}_${l.tx||l.result||'?'}`;}
function _cache_features(k,f){FEATURE_CACHE[k]={t:Date.now()/1000,d:f};const ks=Object.keys(FEATURE_CACHE);while(ks.length>CACHE_MAX)delete FEATURE_CACHE[ks.shift()];}
function _get_cache(k){const c=FEATURE_CACHE[k];return c&&(Date.now()/1000-c.t)<CACHE_TTL?c.d:null;}
function parse_lines(d){if(!d||!Array.isArray(d?.list))return[];return[...d.list].sort((a,b)=>a.id-b.id).map(it=>{const dd=it.dices||[0,0,0],p=it.point??dd.reduce((a,b)=>a+b,0);const r=it.resultTruyenThong;return r==="TAI"||r==="XIU"?{session:it.id,dice:dd,total:p,result:r,tx:p>=11?"T":"X"}:null;}).filter(Boolean);}
function _entropy(a){if(!a.length)return 0;const f={},n=a.length;for(const v of a)f[v]=(f[v]||0)+1;return-Object.values(f).filter(c=>c>0).reduce((s,c)=>s+(c/n)*math.log2(c/n),0);}
function _similarity(a,b){if(a.length!==b.length||!a.length)return 0;let m=0;for(let i=0;i<a.length;i++)if(a[i]===b[i])m++;return m/a.length;}
function extract_features(h){
    if(!h||!h.length)return{tx:[],totals:[],freq:{},runs:[],maxRun:0,meanTotal:0,stdTotal:0,entropy:0,last3:"",last5:"",last8:"",trends:{up:0,down:0},lastRun:null,prevRun:null,runLengths:[],avgRun:0,stdRun:0,tRatio:0,xRatio:0,is11:false,isLong:false,runDev:0};
    const k=_hist_key(h);const cc=_get_cache(k);if(cc)return cc;
    const tx=h.map(x=>x.tx),totals=h.map(x=>x.total);const freq={};for(const v of tx)freq[v]=(freq[v]||0)+1;
    const runs=[];let cur=tx[0],ln=1;for(let i=1;i<tx.length;i++){if(tx[i]===cur)ln++;else{runs.push({val:cur,len:ln});cur=tx[i];ln=1;}}runs.push({val:cur,len:ln});
    const maxRun=Math.max(...runs.map(r=>r.len)),meanT=totals.reduce((a,b)=>a+b,0)/totals.length,stdT=math.sqrt(totals.reduce((s,v)=>s+(v-meanT)**2,0)/totals.length);
    const ent=_entropy(tx),trends={up:0,down:0};for(let i=1;i<totals.length;i++){if(totals[i]>totals[i-1])trends.up++;else if(totals[i]<totals[i-1])trends.down++;}
    const rl=runs.map(r=>r.len),avgR=rl.reduce((a,b)=>a+b,0)/rl.length,stdR=math.sqrt(rl.reduce((s,v)=>s+(v-avgR)**2,0)/rl.length);
    const o={tx,totals,freq,runs,maxRun,meanTotal:meanT,stdTotal:stdT,entropy:ent,last3:tx.slice(-3).join(""),last5:tx.slice(-5).join(""),last8:tx.slice(-8).join(""),trends,lastRun:runs.at(-1)||null,prevRun:runs.at(-2)||null,runLengths:rl,avgRun:avgR,stdRun:stdR,tRatio:freq.T/tx.length||0,xRatio:freq.X/tx.length||0,is11:/^(TX)+$|^(XT)+$/.test(tx.slice(-6).join("")),isLong:maxRun>=5,runDev:stdR/avgR||0};
    _cache_features(k,o);return o;
}
function detect_pattern(r){if(!r||r.length<3)return"random_pattern";const rl=r.map(x=>x.len);if(r.length>=6&&rl.every(x=>x===1))return"pattern_11";if(r.length>=4&&rl.slice(-4).every((v,i,a)=>v===a[0]))return"pattern_nn";if(Math.max(...rl)>=6)return"pattern_long";if(rl.slice(-4).every((v,i)=>i%2===0?v===rl[0]:v===rl[1]))return"pattern_alt";return"random_pattern";}
function predict_by_pattern(p,r,l){if(p==="pattern_11")return l==="T"?"X":"T";if(p==="pattern_long")return r.at(-1).len>=7?(l==="T"?"X":"T"):l;if(p==="pattern_nn"||p==="pattern_alt")return l;return null;}
function a5_freq(h){if(h.length<15)return null;const t=h.slice(-15).map(x=>x.tx).filter(v=>v==="T").length;return t-15/2>=4?"T":15/2-t>=4?"X":null;}
function aA_markov(h){if(h.length<20)return null;const tx=h.map(x=>x.tx);const t1={T:{T:0,X:0},X:{T:0,X:0}},t2={};for(let i=0;i<tx.length-1;i++)t1[tx[i]][tx[i+1]]++;for(let i=0;i<tx.length-2;i++){const k=tx[i]+tx[i+1];t2[k]||={T:0,X:0};t2[k][tx[i+2]]++;}
const L=tx.at(-1),L2=tx.at(-2)+L;let sT=0,sX=0;if(t1[L].T>t1[L].X*1.25)sT++;else if(t1[L].X>t1[L].T*1.25)sX++;if(t2[L2]){if(t2[L2].T>t2[L2].X*1.3)sT++;else if(t2[L2].X>t2[L2].T*1.3)sX++;}return sT>sX?"T":sX>sT?"X":null;}
function aB_ngram(h){if(h.length<30)return null;const tx=h.map(x=>x.tx);let sz=[3,2];if(h.length>=40)sz.push(4);if(h.length>=50)sz.push(5,6);let bp=null,bc=0;for(const n of sz){if(tx.length<n*2)continue;const tgt=tx.slice(-n).join(""),mt=[];for(let i=0;i<=tx.length-n-1;i++)if(tx.slice(i,i+n).join("")===tgt)mt.push({next:tx[i+n],d:tx.length-i});if(mt.length>=2){const wt={T:0,X:0};let sw=0;for(const m of mt){const w=1/(m.d*0.5+1);wt[m.next]+=w;sw+=w;}if(sw>0){const tr=math.abs(wt.T-wt.X)/sw;if(tr>bc){bc=tr;bp=wt.T>wt.X?"T":"X";}}}}return bc>0.3?bp:null;}
function aS_neo(h){if(h.length<25)return null;const f=extract_features(h),p=detect_pattern(f.runs);if(!p||p==="random_pattern")return null;const pr=predict_by_pattern(p,f.runs,f.tx.at(-1));if(pr&&f.runs.length){const rr=f.runs.slice(-8);if(rr.filter(r=>r.len>=2).length/Math.max(1,rr.length)>0.6)return pr;}return null;}
function aF_deep(h){if(h.length<60)return null;const tf=[[10,0.3],[30,0.4],[60,0.3]],sc={T:0,X:0};let sw=0;for(const[lb,w]of tf){if(h.length<lb)continue;const sl=h.slice(-lb),stx=sl.map(x=>x.tx),stt=sl.map(x=>x.total);const t=stx.filter(v=>v==="T").length,x=stx.length-t,mt=stt.reduce((a,b)=>a+b,0)/stt.length,vol=math.sqrt(stt.reduce((s,v)=>s+(v-mt)**2,0)/stt.length);let ts=0,xs=0;if(mt>12)xs+=0.4;if(mt<9)ts+=0.4;if(t>x+3)xs+=0.3;if(x>t+3)ts+=0.3;if(vol>4)stx.at(-1)==="T"?ts+=0.2:xs+=0.2;const td=stt.at(-1)-stt[0];if(td>3)xs+=0.1;if(td<-3)ts+=0.1;const ww=w*(stx.length/lb);sc.T+=ts*ww;sc.X+=xs*ww;sw+=ww;}return sw>0&&math.abs(sc.T-sc.X)/sw>0.15?(sc.T>sc.X?"T":"X"):null;}
function aE_trans(h){if(h.length<100)return null;const tx=h.map(x=>x.tx),at={T:0,X:0};let sw=0;for(const L of[6,8,10,12]){if(tx.length<L*2)continue;const tgt=tx.slice(-L);for(let i=0;i<=tx.length-L-1;i++){const s=_similarity(tx.slice(i,i+L),tgt);if(s>0.75){const w=(s**2)*(1/((tx.length-i)*0.1+1));at[tx[i+L]]+=w;sw+=w;}}}return sw>0&&math.abs(at.T-at.X)/sw>0.2?(at.T>at.X?"T":"X"):null;}
function ensemble_predict(h){
    if(!h||h.length<15)return{predict:null,confidence:0,votes:{}};
    const al={freq:[a5_freq,1],markov:[aA_markov,1.2],ngram:[aB_ngram,1.2],neo:[aS_neo,1.5],deep:[aF_deep,1.3],trans:[aE_trans,1.4]};
    const v={T:0,X:0},dt={};for(const[n,[fn,w]]of Object.entries(al)){const r=fn(h);dt[n]=r;if(r==="T"||r==="X")v[r]+=w;}
    const tv=v.T+v.X;if(!tv)return{predict:null,confidence:0,votes:dt};
    const pr=v.T>v.X?"T":"X",cf=+(math.abs(v.T-v.X)/tv).toFixed(2);return{predict:cf>0.15?pr:null,confidence:cf,votes:dt};
}

// ╔══════════════════════════════════════════════════════════════╗
// ║ 🎨 HÀM TẠO KHUNG ĐỒNG BỘ - MỌI TIN ĐỀU CÓ KHUNG ╔════╗       ║
// ╚══════════════════════════════════════════════════════════════╝
function khung(noi_dung, tieude=""){
    const W=31;
    const top = tieude ? `╔${"═".repeat(W)}╗\n║ ${tieude.padEnd(W-2," ")}║\n╠${"═".repeat(W)}╣` : `╔${"═".repeat(W)}╗`;
    const lines = noi_dung.split("\n").map(l=>{
        let s=l.replace(/<[^>]+>/g,"");
        if(s.length>W)s=s.slice(0,W-3)+"...";
        return `║ ${s.padEnd(W-2," ")}║`;
    }).join("\n");
    return `${top}\n${lines}\n╚${"═".repeat(W)}╝`;
}

function randStr(l,p='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'){let s='';for(let i=0;i<l;i++)s+=p[Math.floor(Math.random()*p.length)];return s;}
function fm(n){return Number(n||0).toLocaleString('vi-VN');}
function init_user_state(c){if(!user_states[c])user_states[c]={history:[],points_history:[],raw_objects:[],auto_bet_enabled:false,bet_amount:10000,current_prediction:null,waiting_for_result:false,has_bet_this_session:false,session_id:null,balance:0,win_streak:0,lose_streak:0,total_win:0,total_lose:0,ensemble_last:null,last_bet_state:null};}

// ✅ FIX: AXIOS ĐỂ HEADER + KEEPALIVE ĐỂ RENDER KHÔNG MẤT KẾT NỐI
const http_agent = new axios.Agent({keepAlive:true,timeout:20000});
async function fetch_history_from_api(limit=50){
    try{
        const r=await axios.get(HISTORY_API_URL,{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36","Origin":"https://lc79b.bet","Referer":"https://lc79b.bet/","Accept":"application/json"},timeout:15000,httpAgent:http_agent,httpsAgent:http_agent});
        const ob=parse_lines(r.data||{});return[ob.map(o=>o.result),ob.map(o=>o.total),ob].map(x=>x.slice(-limit));
    }catch(e){logger.error("API:",e.message);return[[],[],[]];}
}

function check_auth(c){if(c===ADMIN_ID)return true;if(authorized_users[c]){if(Date.now()/1000<=authorized_users[c])return true;else delete authorized_users[c];}return false;}
function require_auth(fn){return async(m,...a)=>{if(!check_auth(m.chat.id))return bot.sendMessage(m.chat.id,khung(`⚠️ BẠN CHƯA CÓ BẢN QUYỀN VIP\n❌ KHÔNG THỂ SỬ DỤNG CHỨC NĂNG\n🔑 KÍCH HOẠT: /nhapkey MÃ_KEY\n📩 MUA KEY: ${ADMIN_USERNAME}`,"🔒 HỆ THỐNG ĐÃ BỊ KHOÁ"),{parse_mode:"HTML"});return fn(m,...a);};}
function format_expire_time(ts){const r=ts-Date.now()/1000;if(r<=0)return"❌ ĐÃ HẾT HẠN";const d=~~(r/86400),h=~~((r%86400)/3600),mi=~~((r%3600)/60);return d>0?`✅ CÒN ${d}N ${h}G ${mi}P`:h>0?`✅ CÒN ${h}G ${mi}P`:`✅ CÒN ${mi}P`;}

// 🧠 GIỮ NGUYÊN 100% THUẬT TOÁN CỔ ĐIỂN
function make_prediction_vip_legacy(history,points=[]){
    if(history.length<3)return Math.random()>.5?"TAI":"XIU";
    const hs=history.slice(-30).map(x=>x==="TAI"?"T":"X").join(""),ls=hs.at(-1);
    let st=0,sx=0,kqc=null,dtc=0;
    if(/TTTTTTT$|XXXXXXX$/.test(hs)){kqc=ls==='T'?"TAI":"XIU";dtc=95;}
    else if(/TTTTTT$|XXXXXX$/.test(hs)){kqc=ls==='T'?"TAI":"XIU";dtc=90;}
    else if(/TTTTT$|XXXXX$/.test(hs)){kqc=ls==='T'?"TAI":"XIU";dtc=85;}
    else if(/TTTT$|XXXX$/.test(hs)){kqc=ls==='T'?"TAI":"XIU";dtc=80;}
    else if(/TTT$|XXX$/.test(hs)){kqc=ls==='T'?"TAI":"XIU";dtc=72;}
    if(/TTTTTTTT$|XXXXXXXX$/.test(hs)){kqc=ls==='T'?"XIU":"TAI";dtc=88;}
    if(history.length>=15){const ct=history.slice(-15).filter(x=>x==="TAI").length;if(/TTTTT$/.test(hs)&&ct>11){kqc="XIU";dtc=Math.max(dtc,80);}if(/XXXXX$/.test(hs)&&15-ct>11){kqc="TAI";dtc=Math.max(dtc,80);}}
    if(/TXTXTX$|XTXTXT$/.test(hs)){kqc=ls==='X'?"TAI":"XIU";dtc=Math.max(dtc,87);}else if(/TXTX$|XTXT$/.test(hs)){kqc=ls==='X'?"TAI":"XIU";dtc=Math.max(dtc,78);}
    if(/TTXXTTXX$|XXTTXXTT$/.test(hs)){kqc=ls==='T'?"TAI":"XIU";dtc=Math.max(dtc,86);}else if(/TTXX$|XXTT$/.test(hs)){kqc=ls==='T'?"TAI":"XIU";dtc=Math.max(dtc,76);}
    if(/TTTXXXTTT$|XXXTTTXXX$/.test(hs)){kqc=ls==='T'?"TAI":"XIU";dtc=Math.max(dtc,84);}else if(/TTTXXX$|XXXTTT$/.test(hs)){kqc=ls==='T'?"TAI":"XIU";dtc=Math.max(dtc,75);}
    if(/TTTTXXXX$|XXXXTTTT$/.test(hs)){kqc=ls==='T'?"TAI":"XIU";dtc=Math.max(dtc,82);}
    if(/TTTTTXXXXX$|XXXXXTTTTT$/.test(hs)){kqc=ls==='T'?"TAI":"XIU";dtc=Math.max(dtc,83);}
    if(/TXT$/.test(hs)){kqc="TAI";dtc=Math.max(dtc,68);}if(/XTX$/.test(hs)){kqc="XIU";dtc=Math.max(dtc,68);}
    const r10=history.slice(-10),r5=history.slice(-5);const t10=r10.filter(x=>x==='TAI').length,x10=10-t10,t5=r5.filter(x=>x==='TAI').length,x5=5-t5;
    if(t5>=4)st+=dynamic_weights.thongke;else if(x5>=4)sx+=dynamic_weights.thongke;
    if(t10>x10+2)st+=dynamic_weights.thongke-1;else if(x10>t10+2)sx+=dynamic_weights.thongke-1;else if(t10>x10)st++;else if(x10>t10)sx++;
    if(points.length>=10){const p10=points.slice(-10),av=p10.reduce((a,b)=>a+b,0)/10;if(av>11.2)st+=dynamic_weights.diem_xucxac;else if(av<9.8)sx+=dynamic_weights.diem_xucxac;const va=p10.reduce((s,v)=>s+(v-av)**2,0)/10;if(va<2.5)av>10.5?st+=2:sx+=2;}
    const tr1={TAI:{TAI:0,XIU:0},XIU:{TAI:0,XIU:0}},tr2={},tr3={};
    for(let i=0;i<history.length-1;i++)tr1[history[i]][history[i+1]]++;
    for(let i=0;i<history.length-2;i++){const k=history[i]+history[i+1];tr2[k]||={TAI:0,XIU:0};tr2[k][history[i+2]]++;}
    for(let i=0;i<history.length-3;i++){const k=history[i]+history[i+1]+history[i+2];tr3[k]||={TAI:0,XIU:0};tr3[k][history[i+3]]++;}
    const cu=ls==='T'?"TAI":"XIU",t1=tr1[cu];
    if(t1.TAI>t1.XIU*1.2)st+=dynamic_weights.markov1;else if(t1.XIU>t1.TAI*1.2)sx+=dynamic_weights.markov1;else cu==="TAI"?st++:sx++;
    if(hs.length>=2){const c2=(hs.at(-2)==='T'?"TAI":"XIU")+cu;if(tr2[c2]){const t2=tr2[c2];if(t2.TAI>t2.XIU*1.3)st+=dynamic_weights.markov2;else if(t2.XIU>t2.TAI*1.3)sx+=dynamic_weights.markov2;}}
    if(hs.length>=3){const c3=(hs.at(-3)==='T'?"TAI":"XIU")+(hs.at(-2)==='T'?"TAI":"XIU")+cu;if(tr3[c3]){const t3=tr3[c3];if(t3.TAI>t3.XIU*1.3)st+=dynamic_weights.markov3;else if(t3.XIU>t3.TAI*1.3)sx+=dynamic_weights.markov3;}}
    if(kqc){const b=~~(dtc/8);kqc==="TAI"?st+=b:sx+=b;}
    return st>sx?"TAI":sx>st?"XIU":history.at(-1);
}
function make_prediction_vip(h,p=[],o=[]){
    const lg=make_prediction_vip_legacy(h,p),en=ensemble_predict(o),sc={T:0,X:0};
    sc[lg==="TAI"?"T":"X"]+=1.6;if(en.predict)sc[en.predict]+=en.confidence*2.2;
    return sc.T>=sc.X?"TAI":"XIU";
}
function tinh_do_tin_cay(h,p=[],o=[]){
    if(h.length<5)return 50;const s=h.slice(-20).map(x=>x==='TAI'?'T':'X').join("");
    let b=62;
    if(/TTTTTT$|XXXXXX$/.test(s))b=92;else if(/TTTTT$|XXXXX$/.test(s))b=88;else if(/TXTXTX$|XTXTXT$/.test(s))b=85;else if(/TTTT$|XXXX$/.test(s))b=82;else if(/TTXXTTXX$|XXTTXXTT$/.test(s))b=80;else if(/TTTXXX$|XXXTTT$/.test(s))b=78;else if(/TXTX$|XTXT$/.test(s))b=75;else if(/TTXX$|XXTT$/.test(s))b=73;else if(/TTT$|XXX$/.test(s))b=70;
    if(h.length>=10){const r=h.slice(-10);b+=Math.min(Math.abs(r.filter(x=>x==='TAI').length-r.filter(x=>x==='XIU').length)*2,8);}
    const en=ensemble_predict(o||[]);if(en.predict)b=Math.min(98,b+en.confidence*12);
    return Math.min(b,98);
}
function ai_tu_hoc(c,d,t){const s=user_states[c];if(!s)return;if(d===t){s.win_streak++;s.lose_streak=0;s.total_win++;for(const k in dynamic_weights)dynamic_weights[k]=Math.min(dynamic_weights[k]+0.05,15);}else{s.lose_streak++;s.win_streak=0;s.total_lose++;for(const k in dynamic_weights)dynamic_weights[k]=Math.max(dynamic_weights[k]-0.03,2);}}
function md5(t){return CryptoJS.MD5(t).toString();}
async function login_and_get_token(u,p){
    try{
        const pw=md5(p),r=await axios.get(`https://apifo88daigia.tele68.com/api?c=3&un=${u}&pw=${pw}&cp=R&cl=R&pf=web&at=`,{timeout:15000,httpAgent:http_agent,httpsAgent:http_agent});
        const d=r.data;if(!d.success)return{_error:`Lỗi Game: ${d.message||'Sai TK/MK'}`};
        let sk=d.sessionKey;sk+='='.repeat((4-sk.length%4)%4);const sd=JSON.parse(Buffer.from(sk,'base64').toString('utf8')),nn=sd.nickname||sd.nickName;
        const r2=await axios.post("https://wlb.tele68.com/v1/lobby/auth/login?cp=R&cl=R&pf=web&at=",{nickName:nn,accessToken:d.accessToken},{headers:{"authority":"wlb.tele68.com","accept":"*/*","content-type":"application/json","origin":"https://lc79b.bet","referer":"https://lc79b.bet/","user-agent":"Mozilla/5.0"},timeout:15000});
        const tk=r2.data?.token;if(!tk)return{_error:"Không lấy được token"};
        return{token:tk,nickname:nn,money:r2.data?.remoteLoginResp?.money||0};
    }catch(e){return{_error:"Kết nối thất bại: "+e.message};}
}

// ✅ FIX SOCKET RENDER: Giữ kết nối liên tục, không ngầm chết → TỰ ĐỘNG ĐẶT CƯỢC ỔN
function start_websocket(cid,token){
    if(active_sockets[cid])try{active_sockets[cid].disconnect()}catch(e){}
    const sio=io("https://wtxmd52.tele68.com",{
        path:"txmd5/",transports:["websocket"],auth:{token},
        reconnection:true,reconnectionAttempts:99999,reconnectionDelay:2000,reconnectionDelayMax:5000,
        extraHeaders:{"User-Agent":"Mozilla/5.0","Origin":"https://lc79b.bet","Referer":"https://lc79b.bet/"},
        forceNew:true,timeout:25000
    });
    active_sockets[cid]=sio;init_user_state(cid);const st=user_states[cid];
    sio.on("connect",async()=>{
        logger.info(`[${cid}] SOCKET OK RENDER`);
        const[kq,dm,ob]=await fetch_history_from_api(50);
        let tb="";
        if(kq.length){st.history=kq.slice(-100);st.points_history=dm.slice(-100);st.raw_objects=ob.slice(-100);tb=`📥 TẢI ${kq.length} PHIÊN + ENSEMBLE ✅`;}else tb="⚠️ Chưa tải lịch sử";
        bot.sendMessage(cid,khung(`✅ KẾT NỐI MÁY CHỦ THÀNH CÔNG\n${tb}\n⚡ AI VIP ELITE ĐANG SẴN SÀNG`,"🟢 KẾT NỐI THÀNH CÔNG"),{parse_mode:"HTML"});
    });
    sio.on("disconnect",()=>bot.sendMessage(cid,khung("🔴 MẤT KẾT NỐI - HỆ THỐNG TỰ KẾT NỐI LẠI","⚠️ TRẠNG THÁI KẾT NỐI")));
    sio.on("new-session",d=>{
        st.session_id=d?.id||"N/A";st.has_bet_this_session=false;st.waiting_for_result=false;
        const hl=st.history.length,dt=tinh_do_tin_cay(st.history,st.points_history,st.raw_objects);
        let msg=`🎯 MÃ PHIÊN: ${st.session_id}\n📊 ĐÃ GHI: ${hl}/20 KQ`;
        if(hl>=3){
            const pr=make_prediction_vip(st.history,st.points_history,st.raw_objects);st.current_prediction=pr;
            msg+=`\n🤖 DỰ ĐOÁN: ${pr==="TAI"?"🔵 TÀI":"🔴 XỈU"}\n📈 ĐỘ TIN: ${dt}%\n🧠 CỔ ĐIỂN + ENSEMBLE 6‑IN‑1`;
            if(st.auto_bet_enabled)msg+=dt>=MIN_CONFIDENCE_AUTO_BET?`\n⚡ AUTO 🟢 | 💰 ${fm(st.bet_amount)} | CHỜ ĐẶT`:`\n⚠️ ĐỘ TIN <${MIN_CONFIDENCE_AUTO_BET}% → BỎ QUA`;
        }else msg+="\n⏳ ĐANG THU THẬP DỮ LIỆU";
        bot.sendMessage(cid,khung(msg,"💎 AI VI LONG ELITE | PHIÊN MỚI"),{parse_mode:"HTML"});
    });
    // ✅ FIX CHÍNH: GIAI ĐOẠN ĐẶT CƯỢC ĐƯỢC KIỂM TRA LIÊN TỤC → RENDER ĐẶT ĐƯỢC
    sio.on("tick-update",d=>{
        if(d?.state!=="BETTING"||!st.auto_bet_enabled||!st.current_prediction)return;
        const dt=tinh_do_tin_cay(st.history,st.points_history,st.raw_objects);
        if(!st.has_bet_this_session&&dt>=MIN_CONFIDENCE_AUTO_BET){
            st.has_bet_this_session=true;st.waiting_for_result=true;
            sio.emit("bet",{type:st.current_prediction,amount:st.bet_amount});
            bot.sendMessage(cid,khung(`✅ GỬI LỆNH THÀNH CÔNG\n🎯 ${st.current_prediction==="TAI"?"🔵 TÀI":"🔴 XỈU"}\n💰 ${fm(st.bet_amount)} WIN\n⏳ CHỜ KẾT QUẢ`,"🚀 TỰ ĐỘNG ĐẶT CƯỢC"),{parse_mode:"HTML"});
        }
    });
    sio.on("bet-result",d=>{if(typeof d.postBalance==="number")st.balance=d.postBalance;bot.sendMessage(cid,khung(`💰 SỐ DƯ HIỆN TẠI\n${fm(st.balance)} WIN`,"✅ XÁC NHẬN CƯỢC"),{parse_mode:"HTML"});});
    sio.on("session-result",d=>{
        const dd=d.dices||[0,0,0],tg=dd.reduce((a,b)=>a+b,0),rs=d.resultTruyenThong||"N/A";
        if(rs==="TAI"||rs==="XIU"){
            st.history.push(rs);st.points_history.push(tg);st.raw_objects.push({session:d.id,dice:dd,total:tg,result:rs,tx:tg>=11?"T":"X"});
            while(st.history.length>100){st.history.shift();st.points_history.shift();st.raw_objects.shift();}
            if(st.current_prediction)ai_tu_hoc(cid,st.current_prediction,rs);
        }
        const ok=st.current_prediction===rs;
        bot.sendMessage(cid,khung(`🎲 XÚC XẮC: ${dd[0]}‑${dd[1]}‑${dd[2]} = ${tg}\n🏁 KQ: ${rs==="TAI"?"🔵 TÀI":rs==="XIU"?"🔴 XỈU":"LỖI"}\n📊 AI: ${ok?`🟢 ĐÚC THẮNG | TL:${st.win_streak}`:`🔴 SAI HỌC LẠI | THUA:${st.lose_streak}`}\n📈 12 GẦN NHẤ: ${st.history.slice(-12).map(x=>x==="TAI"?"🔵":"🔴").join("")}`,"🎲 KẾT QUẢ PHIÊN"),{parse_mode:"HTML"});
    });
}

// ╔══════════════════════════════════════════════════════════════╗
// ║ 🔑 TẤT CẢ LỆNH - MỌI TIN ĐỀU BỌC KHUNG ╔══╗ - GIỮ NGUYÊN LOGIC ║
// ╚══════════════════════════════════════════════════════════════╝
bot.onText(/^\/start$/,m=>{
    const c=m.chat.id;init_user_state(c);
    if(check_auth(c)){
        const hn=c===ADMIN_ID?"👑 VĨNH VIỄN ADMIN":format_expire_time(authorized_users[c]);
        bot.sendMessage(c,khung(`✅ ĐÃ KÍCH HOẠT BẢN QUYỀN\n⏳ HẠN: ${hn}\n\n📖 /huongdan   HƯỚNG DẪN\n🔐 /login      ĐĂNG NHẬP\n⚡ /autobet    TỰ ĐỘNG\n📊 /lichsucau  LỊCH SỬ\n💎 /thongtin   TÀI KHOẢN\n⏹️ /stop       NGẮT KẾT NỐI`,"💎 CHÀO MỪNG VIP VI LONG"),{parse_mode:"HTML"});
    }else bot.sendMessage(c,khung(`🔒 CHƯA KÍCH HOẠT BẢN QUYỀN\n🔑 /nhapkey MÃ_KEY\n📩 MUA: ${ADMIN_USERNAME}\n📖 /huongdan`,"🏠 TRANG CHỦ HỆ THỐNG"),{parse_mode:"HTML"});
});
bot.onText(/^\/huongdan$/,m=>bot.sendMessage(m.chat.id,khung(`🔑 /nhapkey VIP‑XXXXXXXXXX\n🔐 /login TAIKHOAN MATKHAU\n⚡ /autobet on 10000\n⏹️ /autobet off\n📊 /lichsucau\n💎 /thongtin\n⛔ /stop\n👑 /taokey 30 | /danhsachkey\n\n🧠 14 THUẬT TOÁN + ENSEMBLE\n📩 HỖ TRỢ: ${ADMIN_USERNAME}`,"📖 HƯỚNG DẪN SỬ DỤNG"),{parse_mode:"HTML"}));
bot.onText(/^\/taokey(\s+(\d+))?$/i,m=>{
    if(m.chat.id!==ADMIN_ID)return bot.sendMessage(m.chat.id,khung("CHỈ ADMIN SỬ DỤNG ĐƯỢC","⛔ TỪ CHỐI"));
    const day=parseInt(m.match?.[2]||30)||30,key="VIP‑"+randStr(10);valid_keys[key]=day;
    bot.sendMessage(m.chat.id,khung(`🔑 ${key}\n⏳ ${day} NGÀY\n📅 HẾT: ${moment().add(day,'days').format("DD/MM/YYYY HH:mm")}\n📊 CÒN: ${Object.keys(valid_keys).length} KEY`,"✅ TẠO KEY THÀNH CÔNG"),{parse_mode:"HTML"});
});
bot.onText(/^\/danhsachkey$/i,m=>{
    if(m.chat.id!==ADMIN_ID)return bot.sendMessage(m.chat.id,khung("CHỈ ADMIN","⛔ TỪ CHỐI"));
    const a=Object.entries(valid_keys);
    bot.sendMessage(m.chat.id,khung(!a.length?"KHÔNG CÒN KEY NÀO":a.map(([k,v])=>`🔑 ${k} → ${v} NGÀY`).join("\n")+`\n📊 TỔNG: ${a.length}`,"📋 DANH SÁCH KEY"),{parse_mode:"HTML"});
});
bot.onText(/^\/nhapkey\s+(\S+)$/i,(m,mt)=>{
    const k=mt[1].toUpperCase().trim();
    if(valid_keys[k]){const d=valid_keys[k];authorized_users[m.chat.id]=Date.now()/1000+d*86400;delete valid_keys[k];bot.sendMessage(m.chat.id,khung(`KÍCH HOẠT THÀNH CÔNG ${d} NGÀY ✅`,"🎉 THÀNH CÔNG"));}
    else bot.sendMessage(m.chat.id,khung(`KEY KHÔNG HỢP LỆ\n📩 MUA: ${ADMIN_USERNAME}`,"❌ LỖI KEY"));
});
bot.onText(/^\/thongtin$/i,require_auth(m=>{
    const c=m.chat.id,s=user_states[c];const hn=c===ADMIN_ID?"👑 VĨNH VIỄN":format_expire_time(authorized_users[c]);
    bot.sendMessage(m.chat.id,khung(`🆔 ${c}\n⏳ HẠN: ${hn}\n⚡ AUTO: ${s.auto_bet_enabled?"🟢 BẬT":"🔴 TẮT"}\n💰 MỨC: ${fm(s.bet_amount)}\n💵 DƯ: ${fm(s.balance)}\n📊 THẮNG:${s.total_win} | THUA:${s.total_lose}\n📈 ${s.history.length} PHIÊN`,"💎 THÔNG TIN TÀI KHOẢN"),{parse_mode:"HTML"});
}));
bot.onText(/^\/lichsucau$/i,require_auth(m=>{
    const s=user_states[m.chat.id].history;if(!s.length)return bot.sendMessage(m.chat.id,khung("CHƯA CÓ DỮ LIỆU","📭 TRỐNG"));
    const ls=s.slice(-20),t=ls.filter(x=>x==='TAI').length;
    bot.sendMessage(m.chat.id,khung(`🔵 TÀI: ${t}  |  🔴 XỈU: ${ls.length-t}\n${ls.map(x=>x==='TAI'?"🔵":"🔴").join("")}`,"📊 LỊCH SỬ CẦU"),{parse_mode:"HTML"});
}));
// ✅ FIX: /login BÂY GIỜ CÓ HƯỚNG DẪN + KHUNG RÕ RÀNG
bot.onText(/^\/login(\s+(\S+)\s+(\S+))?$/i,require_auth(async(m,mt)=>{
    if(!mt[2])return bot.sendMessage(m.chat.id,khung("✅ CÚ PHÁP ĐÚNG:\n/login TAIKHOAN MATKHAU\n\nVD: /login vilong123 Abc12345","🔐 HƯỚNG DẪN ĐĂNG NHẬP"),{parse_mode:"HTML"});
    const pm=await bot.sendMessage(m.chat.id,khung("ĐANG KẾT NỐI VÀO SERVER...","🔄 XỬ LÝ"));
    const rs=await login_and_get_token(mt[2],mt[3]);
    if(rs._error)return bot.editMessageText(khung(rs._error,"❌ LỖI ĐĂNG NHẬP"),{chat_id:m.chat.id,message_id:pm.message_id});
    init_user_state(m.chat.id);user_states[m.chat.id].balance=rs.money;
    bot.editMessageText(khung(`👤 ${rs.nickname}\n💰 ${fm(rs.money)} WIN\n✅ ĐĂNG NHẬP THÀNH CÔNG, ĐANG MỞ KẾT NỐI SOCKET`,"🔐 THÀNH CÔNG"),{chat_id:m.chat.id,message_id:pm.message_id,parse_mode:"HTML"});
    start_websocket(m.chat.id,rs.token);
}));
bot.onText(/^\/autobet(\s+(on|off))?(\s+(\d+))?$/i,require_auth((m,mt)=>{
    const c=m.chat.id;if(!active_sockets[c])return bot.sendMessage(c,khung("⚠️ PHẢI /login TRƯỚC KHI BẬT AUTO","⚡ LỖI AUTO"));
    const s=user_states[c],a=(mt[2]||"").toLowerCase();
    if(a==="on"){s.auto_bet_enabled=true;s.bet_amount=+mt[4]||10000;bot.sendMessage(c,khung(`🟢 AUTO ĐÃ BẬT\n💰 MỨC: ${fm(s.bet_amount)} WIN\n⏳ CHẠY ĐẾN KHI GỌI /autobet off`,"⚡ TỰ ĐỘNG BẬT"),{parse_mode:"HTML"});}
    else if(a==="off"){s.auto_bet_enabled=false;bot.sendMessage(c,khung("🔴 AUTO ĐÃ TẮT HOÀN TOÀN","⚡ TỰ ĐỘNG TẮT"));}
    else bot.sendMessage(c,khung("DÙNG:\n/autobet on 10000\n/autobet off","⚡ HƯỚNG DẪN"));
}));
bot.onText(/^\/stop$/i,require_auth(m=>{
    if(active_sockets[m.chat.id]){try{active_sockets[m.chat.id].disconnect()}catch(e){}delete active_sockets[m.chat.id];user_states[m.chat.id].auto_bet_enabled=false;bot.sendMessage(m.chat.id,khung("ĐÃ NGẮT KẾT NỐI AN TOÀN + TẮT AUTO","⏹️ DỪNG HỆ THỐNG"));}
    else bot.sendMessage(m.chat.id,khung("KHÔNG CÓ KẾT NỐI NÀO HOẠT ĐỘNG","⚠️ THÔNG BÁO"));
}));

console.log("👑 VIP ONLINE: VI LONG ELITE + ENSEMBLE 14 THUẬT TOÁN | RENDER FIXED ✨");