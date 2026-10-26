// Server-side proxy: never expose the football-data.org token in browser code.
const allowed=new Set(['PL','PD','BL1','SA','FL1','CL','PPL','DED']);
const dateOk=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'));
const iso=d=>d.toISOString().slice(0,10);
const score=m=>m.score?.fullTime;
const finished=m=>m.status==='FINISHED'&&Number.isInteger(score(m)?.home)&&Number.isInteger(score(m)?.away);
function stats(matches,teamId,cutoff){let games=matches.filter(m=>finished(m)&&m.utcDate<cutoff&&(m.homeTeam?.id===teamId||m.awayTeam?.id===teamId)).sort((a,b)=>b.utcDate.localeCompare(a.utcDate)).slice(0,10);let gf=0,ga=0;for(const m of games){const home=m.homeTeam.id===teamId;gf+=home?score(m).home:score(m).away;ga+=home?score(m).away:score(m).home;}return {n:games.length,attack:games.length?gf/games.length:null,defense:games.length?ga/games.length:null}}
exports.handler=async(event)=>{
 if(event.httpMethod!=='GET')return{statusCode:405,body:'Method not allowed'};
 const token=process.env.FOOTBALL_DATA_TOKEN;
 if(!token)return{statusCode:503,headers:{'Content-Type':'application/json'},body:JSON.stringify({error:'Falta configurar FOOTBALL_DATA_TOKEN en las variables de entorno de Netlify.'})};
 const date=event.queryStringParameters?.date,league=event.queryStringParameters?.league;
 if(!dateOk(date)||!allowed.has(league))return{statusCode:400,body:JSON.stringify({error:'Fecha o liga inválida.'})};
 // A single competition request fetches historical results plus the selected day.
 const from=new Date(date+'T00:00:00Z');from.setUTCDate(from.getUTCDate()-85);
 const to=new Date(date+'T00:00:00Z');to.setUTCDate(to.getUTCDate()+1); // Chile can be UTC next day.
 const u=new URL('https://api.football-data.org/v4/competitions/'+league+'/matches');u.searchParams.set('dateFrom',iso(from));u.searchParams.set('dateTo',iso(to));
 try{const res=await fetch(u,{headers:{'X-Auth-Token':token},signal:AbortSignal.timeout(12000)});if(!res.ok){return{statusCode:502,headers:{'Content-Type':'application/json'},body:JSON.stringify({error:res.status===429?'El proveedor limitó temporalmente las consultas.':res.status===403?'La liga no está incluida en tu plan de datos.':'El proveedor devolvió el código '+res.status+': '+await res.text()})}}const data=await res.json();const matches=data.matches||[];const dayMatches=matches.filter(m=>{try{return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(m.utcDate))===date}catch{return false}});
 const result=dayMatches.map(m=>{const a=stats(matches,m.homeTeam.id,m.utcDate),b=stats(matches,m.awayTeam.id,m.utcDate); // Recent scored/conceded goals blended; heuristic home factor 1.1, away .9.
 const xh=a.n>=3&&b.n>=3?Math.min(5,Math.max(.1,((a.attack+b.defense)/2)*1.10)):null;
 const xa=a.n>=3&&b.n>=3?Math.min(5,Math.max(.1,((b.attack+a.defense)/2)*.90)):null;
 return{id:m.id,homeName:m.homeTeam.shortName||m.homeTeam.name,awayName:m.awayTeam.shortName||m.awayTeam.name,utcDate:m.utcDate,status:m.status,homeGames:a.n,awayGames:b.n,xh,xa};});return{statusCode:200,headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=300'},body:JSON.stringify({matches:result})}}
 catch(e){return{statusCode:502,headers:{'Content-Type':'application/json'},body:JSON.stringify({error:'Error al conectar con football-data.org: '+e.message})}}
};
