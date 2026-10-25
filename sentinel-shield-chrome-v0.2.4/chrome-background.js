/* Sentinel Shield Chrome engine — Manifest V3 declarativeNetRequest. */
'use strict';
const DEFAULTS = {
  enabled:true, blockAds:true, blockTrackers:true, blockMalware:true, blockAnnoyances:true,
  cosmeticFiltering:true, showPageBadge:false, reducedMotion:false, showTrackerCount:true, strictThirdPartyScripts:false, warnMaliciousScripts:true, warnHttp:true,
  language:'en', allowlistDomains:[], pausedSites:[], customBlockedHosts:[], customUrlRules:[], customCosmeticSelectors:[]
};
const SOURCES = [
 {id:'community-hosts',label:'StevenBlack unified hosts',category:'trackers',url:'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',kind:'hosts',note:'Combined host feed; imported with conservative rules'},
 {id:'easylist',label:'EasyList',category:'ads',url:'https://easylist.to/easylist/easylist.txt',kind:'abp',note:'Advertising and ad delivery filters'},
 {id:'easyprivacy',label:'EasyPrivacy',category:'trackers',url:'https://easylist.to/easylist/easyprivacy.txt',kind:'abp',note:'Tracking and analytics filters'},
 {id:'adguard-tracking',label:'AdGuard Tracking Protection',category:'trackers',url:'https://adguardteam.github.io/AdGuardFilters/SpywareFilter/sections/tracking_servers.txt',kind:'abp',note:'Third-party tracker domain rules; supported subset only'},
 {id:'disconnect-tracking',label:'Disconnect tracker data',category:'trackers',url:'https://raw.githubusercontent.com/disconnectme/disconnect-tracking-protection/master/services.json',kind:'disconnect',note:'Analytics, social, fingerprinting and cryptomining domains; CC BY-NC-SA 4.0'},
 {id:'fanboy-annoyance',label:"Fanboy's Annoyance List",category:'annoyances',url:'https://easylist-downloads.adblockplus.org/fanboy-annoyance.txt',kind:'abp',note:'Popup and in-page annoyance filters (supported subset)'},
 {id:'malware-domains',label:'Blocklist Project — malware domains',category:'malware',url:'https://raw.githubusercontent.com/blocklistproject/Lists/master/malware.txt',kind:'abp',note:'Community threat-domain list; imported with the supported host-anchored subset'}
];
const RULESET = {ads:'ads_rules',trackers:'trackers_rules',malware:'malware_rules',annoyances:'annoyances_rules'};
const CATEGORY_SETTING = {ads:'blockAds',trackers:'blockTrackers',malware:'blockMalware',annoyances:'blockAnnoyances'};
// Per-source quotas fit the browser's dynamic-rule budget while reserving space
// for each category. Chrome's packaged/static rules are accounted separately.
const SOURCE_RULE_LIMITS = {
  'community-hosts': 3000,
  easylist: 3500,
  easyprivacy: 4000,
  'adguard-tracking': 4000,
  'disconnect-tracking': 4000,
  'fanboy-annoyance': 2000,
  'malware-domains': 2000
};
const REMOTE_RULE_LIMIT = Object.values(SOURCE_RULE_LIMITS).reduce((sum, count) => sum + count, 0);
const RESOURCE_TYPES = ['main_frame','sub_frame','stylesheet','script','image','font','object','xmlhttprequest','ping','media','websocket','other'];
const KNOWN_TYPES = new Set(['main_frame','sub_frame','stylesheet','script','image','font','object','xmlhttprequest','ping','media','websocket','other']);
const MULTI_SUFFIX = new Set(['co.uk','org.uk','ac.uk','gov.uk','net.uk','com.au','net.au','org.au','edu.au','gov.au','co.nz','net.nz','org.nz','co.br','com.br','net.br','org.br','gov.br','edu.br','com.cn','com.hk','com.sg','com.mx','com.ar','co.in','co.jp','co.kr','co.za','com.tw','com.my','com.ph','com.vn','com.ng','github.io','gitlab.io','blogspot.com','appspot.com','pages.dev','workers.dev','vercel.app','netlify.app','web.app','firebaseapp.com']);
const COMPATIBILITY_HOSTS = new Set(['typeform.com','intercom.io','crisp.chat','tawk.to','onesignal.com','trustpilot.com','yotpo.com','rechargepayments.com','sendgrid.net','customer.io','launchdarkly.com','split.io','statsig.com','branch.io','google.com','googleapis.com','gstatic.com','googleusercontent.com','youtube.com','googlevideo.com','microsoft.com','microsoftonline.com','office.com','live.com','apple.com','icloud.com','amazon.com','amazonaws.com','cloudfront.net','akamaized.net','akamaihd.net','jsdelivr.net','unpkg.com','cdnjs.cloudflare.com','cloudflare.com','paypal.com','stripe.com','checkout.com','shopify.com','shopifycdn.com','wordpress.com','wp.com']);
let settings={...DEFAULTS};
let localHosts={ads:new Set(),trackers:new Set(),malware:new Set(),annoyances:new Set()};
let remoteMalwareHosts=new Set();
let customBlockedHostsSet=new Set();
let builtInUrls=[];
let cosmeticSelectors=[];
let remoteSpecs=[];
let sourceStatus={};
let requestLog=[];
let stats={day:dayKey(),blockedTotal:0,byCategory:{ads:0,trackers:0,malware:0,annoyances:0,scripts:0},bySite:{},trackerDomains:[]};
let tabStats=new Map();
let tabStatsLoaded=new Set();
let pendingSave=null;
let bootPromise=null;
const activeWarnings=new Map();
const SUPPRESSION_MINUTES=10;
function dayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function emptyStats(){return {day:dayKey(),blockedTotal:0,byCategory:{ads:0,trackers:0,malware:0,annoyances:0,scripts:0},bySite:{},trackerDomains:[]};}
function emptyTabStats(){return {total:0,ads:0,trackers:0,malware:0,annoyances:0,scripts:0,cosmetic:0,uniqueTrackerDomains:[],recentBlocks:[]};}
function validHost(value){const h=String(value||'').trim().toLowerCase().replace(/^\.+|\.+$/g,'');if(!h||h.length>253||h.includes('/')||h.includes(':')||h.includes(' ')||!h.includes('.'))return null;return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)?h:null;}
function hostOf(raw){try{return new URL(raw).hostname.toLowerCase().replace(/^\[|\]$/g,'');}catch{return '';}}
function isDomain(host,domain){return !!host&&!!domain&&(host===domain||host.endsWith('.'+domain));}
function matches(host,set){if(!host)return null;for(let cur=host;cur;){if(set.has(cur))return cur;const i=cur.indexOf('.');if(i<0)break;cur=cur.slice(i+1);}return null;}
function refreshThreatHostSets(){remoteMalwareHosts=new Set(remoteSpecs.filter(s=>s.category==='malware'&&s.host).map(s=>s.host));customBlockedHostsSet=new Set(settings.customBlockedHosts||[]);}
function isKnownMalwareHost(host){return matches(host,localHosts.malware)||matches(host,remoteMalwareHosts)||matches(host,customBlockedHostsSet);}
function registrable(host){const parts=String(host||'').toLowerCase().split('.').filter(Boolean);if(parts.length<2)return host;const last=parts.slice(-2).join('.');return MULTI_SUFFIX.has(last)&&parts.length>2?parts.slice(-3).join('.'):last;}
function firstParty(a,b){if(!a||!b)return false;if(a===b||a.endsWith('.'+b)||b.endsWith('.'+a))return true;return registrable(a)===registrable(b)&&!/^\d/.test(a)&&!/^\d/.test(b);}
function enabled(cat){const k=CATEGORY_SETTING[cat];return !!k&&settings[k]!==false&&settings.enabled!==false;}
function localUrlRules(){const rawLines=[];/* Cached on startup from filters/rules.txt. */return rawLines;}
async function loadPackagedFilters(){
  const [hostText,ruleText,cosmeticText]=await Promise.all([
    fetch(chrome.runtime.getURL('filters/hosts.txt')).then(r=>r.text()),
    fetch(chrome.runtime.getURL('filters/rules.txt')).then(r=>r.text()),
    fetch(chrome.runtime.getURL('filters/cosmetic.txt')).then(r=>r.text())
  ]);
  localHosts={ads:new Set(),trackers:new Set(),malware:new Set(),annoyances:new Set()};
  for(const line of hostText.split(/\r?\n/)){const m=line.trim().match(/^(ads|trackers|malware|annoyances)\|([a-z0-9.-]+)$/i);if(m)localHosts[m[1].toLowerCase()].add(m[2].toLowerCase());}
  builtInUrls=[];
  for(const line of ruleText.split(/\r?\n/)){const m=line.trim().match(/^url\|(ads|trackers|malware|annoyances)\|(.+)$/i);if(m)builtInUrls.push({category:m[1].toLowerCase(),pattern:m[2].toLowerCase()});}
  cosmeticSelectors=cosmeticText.split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#')&&x.length<300);
}
function categoryForHost(host,type,pageHost){
  if(!settings.enabled||!pageHost&&type!=='main_frame')return null;
  if((settings.allowlistDomains||[]).some(d=>isDomain(host,d)))return null;
  if((settings.pausedSites||[]).some(d=>isDomain(pageHost,d)))return null;
  if(settings.blockMalware&&matches(host,new Set([...(localHosts.malware||[]),...(settings.customBlockedHosts||[])])))return {category:'malware',rule:host,reason:'known or custom malware-category host'};
  for(const cat of ['annoyances','ads','trackers']){
    if(!enabled(cat))continue;
    const found=matches(host,localHosts[cat]);
    if(found&&(cat==='annoyances'&&type==='main_frame'||pageHost&&!firstParty(host,pageHost)&&!matches(host,COMPATIBILITY_HOSTS)))return {category:cat,rule:found,reason:`${cat} host rule`};
  }
  if(settings.strictThirdPartyScripts&&type==='script'&&pageHost&&!firstParty(host,pageHost))return {category:'malware',rule:host,reason:'strict third-party script guard'};
  return null;
}
function typeName(type){return type==='subdocument'?'sub_frame':type==='document'?'main_frame':type==='xmlhttprequest'?'xmlhttprequest':type==='websocket'?'websocket':type;}
function urlRuleMatch(url,pageHost,type,targetHost){
  const lower=url.toLowerCase();
  for(const rule of [...builtInUrls,...(settings.customUrlRules||[]).filter(r=>r&&r.value).map(r=>({category:r.category||'ads',pattern:String(r.value).toLowerCase(),custom:true}))]){
    if(!enabled(rule.category)||!lower.includes(rule.pattern)||!pageHost||firstParty(targetHost,pageHost)||matches(targetHost,COMPATIBILITY_HOSTS))continue;
    if(rule.category==='trackers'&&!['script','xmlhttprequest','ping','other','image'].includes(type))continue;
    if(rule.category==='ads'&&!['script','image','stylesheet','xmlhttprequest','sub_frame','ping','media','object','other'].includes(type))continue;
    if(rule.category==='annoyances'&&!['main_frame','script','image','sub_frame','xmlhttprequest','ping'].includes(type))continue;
    return {category:rule.category,rule:rule.pattern,reason:rule.custom?'custom URL pattern':'URL pattern'};
  }
  return null;
}
function remoteMatch(url,targetHost,pageHost,type){
  const lower=url.toLowerCase();
  for(const spec of remoteSpecs){
    if(!enabled(spec.category))continue;
    if(spec.host&&!isDomain(targetHost,spec.host))continue;
    if(spec.domainType==='thirdParty'&&(!pageHost||firstParty(targetHost,pageHost)))continue;
    if(spec.types?.length&&!spec.types.includes(typeName(type)))continue;
    if(spec.include?.length&&!spec.include.some(h=>isDomain(pageHost,h)))continue;
    if(spec.exclude?.some(h=>isDomain(pageHost,h)))continue;
    if(spec.host&&spec.path){if(!new URL(url).pathname.toLowerCase().includes(spec.path.toLowerCase()))continue;}
    else if(spec.urlFilter){let test=spec.urlFilter.replace(/^\|\|/,'').replace(/\^.*$/,'');if(!lower.includes(test.toLowerCase()))continue;}
    else if(!spec.host)continue;
    if(spec.category!=='malware'&&(!pageHost||firstParty(targetHost,pageHost)||matches(targetHost,COMPATIBILITY_HOSTS)))continue;
    return {category:spec.category,rule:spec.host||spec.urlFilter,reason:'downloaded filter list'};
  }
  return null;
}
function matchRequest(details){
  const targetHost=hostOf(details.url);if(!targetHost)return null;
  const type=typeName(details.type||'other');
  const pageUrl=details.documentUrl||details.initiator||details.originUrl||(type==='main_frame'?details.url:'');
  const pageHost=hostOf(pageUrl);
  let match=categoryForHost(targetHost,type,pageHost);
  if(!match)match=urlRuleMatch(details.url,pageHost,type,targetHost);
  if(!match)match=remoteMatch(details.url,targetHost,pageHost,type);
  return match?{...match,targetHost,pageHost,type}:null;
}
async function getTabStats(tabId){
  if(!Number.isInteger(tabId)||tabId<0)return emptyTabStats();
  if(!tabStatsLoaded.has(tabId)){
    const key=`tabStats_${tabId}`;const values=await chrome.storage.session.get(key);
    tabStats.set(tabId,{...emptyTabStats(),...(values[key]||{})});tabStatsLoaded.add(tabId);
  }
  return tabStats.get(tabId)||emptyTabStats();
}
async function updateActionBadge(tabId,value){
  if(!Number.isInteger(tabId)||tabId<0)return;
  value=value||await getTabStats(tabId);
  const count=settings.enabled!==false&&settings.showTrackerCount!==false?Number(value.trackers||0):0;
  const text=count>0?(count>999?'999+':String(count)):'';
  try{await chrome.action.setBadgeBackgroundColor({color:'#70e8c3',tabId});await chrome.action.setBadgeText({text,tabId});await chrome.action.setTitle({title:`Sentinel Shield — ${count} tracker request(s) blocked on this page`,tabId});}catch{}
}
async function publishTabStats(tabId){
  if(!Number.isInteger(tabId)||tabId<0)return;
  const value=await getTabStats(tabId);
  await updateActionBadge(tabId,value);
  try{await chrome.tabs.sendMessage(tabId,{type:'SENTINEL_STATS',stats:value});}catch{}
}
async function saveLater(){
  if(pendingSave)return;
  pendingSave=setTimeout(async()=>{pendingSave=null;try{await chrome.storage.local.set({stats,requestLog:requestLog.slice(0,500),sourceStatus});}catch{}},800);
}
async function recordEvent(details,match){
  const tabId=details.tabId;const pageHost=match.pageHost||'unknown page';const targetHost=match.targetHost||'unknown host';
  if(stats.day!==dayKey())stats=emptyStats();
  stats.blockedTotal++;
  stats.byCategory[match.category]=(stats.byCategory[match.category]||0)+1;
  if(match.type==='script')stats.byCategory.scripts++;
  if(match.category==='trackers'&&!stats.trackerDomains.includes(targetHost)){stats.trackerDomains.push(targetHost);if(stats.trackerDomains.length>5000)stats.trackerDomains.shift();}
  if(pageHost!=='unknown page'){stats.bySite[pageHost]=(stats.bySite[pageHost]||0)+1;}
  const entry={at:Date.now(),tabId,pageHost,targetHost,url:String(details.url||'').slice(0,4000),type:match.type,category:match.category,rule:String(match.rule||''),reason:match.reason||'filter match'};
  requestLog.unshift(entry);if(requestLog.length>500)requestLog.length=500;
  if(Number.isInteger(tabId)&&tabId>=0){
    const value=await getTabStats(tabId);value.total++;
    if(value[match.category]!==undefined)value[match.category]++;
    if(match.type==='script')value.scripts++;
    if(match.category==='trackers'&&!value.uniqueTrackerDomains.includes(targetHost)){value.uniqueTrackerDomains.push(targetHost);if(value.uniqueTrackerDomains.length>500)value.uniqueTrackerDomains.shift();}
    value.recentBlocks ||= [];
    value.recentBlocks.unshift({at:Date.now(),targetHost,category:match.category,type:match.type||'request',reason:match.reason||'filter match',rule:String(match.rule||'')});
    if(value.recentBlocks.length>8)value.recentBlocks.length=8;
    await chrome.storage.session.set({[`tabStats_${tabId}`]:value});
    await publishTabStats(tabId);
  }
  await saveLater();
}
async function recordCosmetic(sender){
  const tabId=sender?.tab?.id; if(!Number.isInteger(tabId)||tabId<0||!settings.enabled||!settings.blockAds||!settings.cosmeticFiltering)return {ok:false};
  const pageHost=hostOf(sender.tab.url||'');if(!pageHost||(settings.pausedSites||[]).some(d=>isDomain(pageHost,d)))return {ok:false};
  const value=await getTabStats(tabId);value.cosmetic=(value.cosmetic||0)+1;value.ads=(value.ads||0)+1;
  await chrome.storage.session.set({[`tabStats_${tabId}`]:value});await publishTabStats(tabId);
  // Cosmetic hides are deliberately not mixed into the network-request totals in daily stats.
  return {ok:true,stats:value};
}
async function getState(siteHost=''){
  if(stats.day!==dayKey())stats=emptyStats();
  const filterCounts=Object.fromEntries(Object.entries(localHosts).map(([k,v])=>[k,v.size]));
  for(const spec of remoteSpecs)if(spec.host)filterCounts[spec.category]=(filterCounts[spec.category]||0)+1;
  const filterCount=Object.values(filterCounts).reduce((a,b)=>a+b,0);
  return {settings,stats,uniqueTrackerDomainCount:(stats.trackerDomains||[]).length,siteBlockedCount:stats.bySite[String(siteHost||'').toLowerCase()]||0,recent:requestLog.slice(0,500),sourceStatus,sources:SOURCES,filterCounts,filterCount,scopedCount:remoteSpecs.filter(s=>s.urlFilter||s.path).length,cosmeticCount:cosmeticSelectors.length,urlRuleCount:builtInUrls.length,updatedAt:Object.values(sourceStatus).map(s=>s.updatedAt||0).reduce((a,b)=>Math.max(a,b),0)};
}
function dnrCondition(spec){
  const c={resourceTypes:(spec.types&&spec.types.length?spec.types:RESOURCE_TYPES).filter(t=>KNOWN_TYPES.has(t))};
  if(spec.host)c.requestDomains=[spec.host];
  if(spec.urlFilter)c.urlFilter=spec.urlFilter;
  if(spec.domainType)c.domainType=spec.domainType;
  if(spec.include?.length)c.initiatorDomains=spec.include;
  if(spec.exclude?.length)c.excludedInitiatorDomains=spec.exclude;
  return c;
}
function dnrRule(spec,id,priority){return {id,priority:priority||spec.priority||20,action:{type:'block'},condition:dnrCondition(spec)};}
function buildDynamicRules(){
  const rules=[];let allowId=1000;
  if(settings.enabled){
    for(const host of [...new Set(settings.allowlistDomains||[])].slice(0,300))rules.push({id:allowId++,priority:150,action:{type:'allow'},condition:{requestDomains:[host],resourceTypes:RESOURCE_TYPES}});
    let pauseId=2000;for(const host of [...new Set(settings.pausedSites||[])].slice(0,300))rules.push({id:pauseId++,priority:140,action:{type:'allow'},condition:{initiatorDomains:[host],resourceTypes:RESOURCE_TYPES}});
    let blockId=4000;for(const host of [...new Set(settings.customBlockedHosts||[])].slice(0,500))if(settings.blockMalware)rules.push({id:blockId++,priority:80,action:{type:'block'},condition:{requestDomains:[host],resourceTypes:['sub_frame','stylesheet','script','image','font','object','xmlhttprequest','ping','media','websocket','other']}});
    if(settings.strictThirdPartyScripts)rules.push({id:9000,priority:5,action:{type:'block'},condition:{domainType:'thirdParty',resourceTypes:['script']}});
    let rid=10000;
    for(const spec of remoteSpecs){if(!enabled(spec.category)||rid>=33000)continue;try{rules.push(dnrRule(spec,rid++,spec.priority||20));}catch{}}
    for(const rule of settings.customUrlRules||[]){if(!rule||!['ads','trackers','malware','annoyances'].includes(rule.category)||!rule.value||!enabled(rule.category)||rid>=33000)continue;rules.push({id:rid++,priority:60,action:{type:'block'},condition:{urlFilter:String(rule.value).slice(0,200),resourceTypes:rule.category==='malware'?['script','sub_frame','image','xmlhttprequest','other']:RESOURCE_TYPES.filter(t=>t!=='main_frame'),...(rule.category==='malware'?{}:{domainType:'thirdParty'})}});}
  }
  return rules.slice(0,28000);
}
async function rebuildDynamicRules(){
  const existing=await chrome.declarativeNetRequest.getDynamicRules();
  const addRules=buildDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds:existing.map(r=>r.id),addRules});
}
async function syncRules(){
  const enabledIds=[];const disabledIds=[];
  for(const [category,id] of Object.entries(RULESET)){if(settings.enabled&&settings[CATEGORY_SETTING[category]]!==false)enabledIds.push(id);else disabledIds.push(id);}
  await chrome.declarativeNetRequest.updateEnabledRulesets({enableRulesetIds:enabledIds,disableRulesetIds:disabledIds});
  await rebuildDynamicRules();
  try{await chrome.declarativeNetRequest.setExtensionActionOptions({displayActionCountAsBadgeText:false});await chrome.action.setBadgeBackgroundColor({color:'#70e8c3'});}catch{}
}
function parseDisconnect(text,source){
  const data=JSON.parse(String(text||''));
  const cats=data?.categories;
  if(!cats||typeof cats!=='object')throw new Error('Disconnect tracker data has no categories object');
  const selected=new Set(['Analytics','Social','FingerprintingGeneral','FingerprintingInvasive','Cryptomining']);
  const found=new Set();
  const walk=(value)=>{
    if(Array.isArray(value)){for(const item of value)walk(item);return;}
    if(!value||typeof value!=='object')return;
    for(const child of Object.values(value)){
      if(Array.isArray(child)){for(const item of child){const host=validHost(item);if(host)found.add(host);else walk(item);}}
      else walk(child);
    }
  };
  for(const [category,value] of Object.entries(cats))if(selected.has(category))walk(value);
  if(!found.size)throw new Error('No supported domains found in Disconnect tracker categories');
  return [...found].filter(host=>!isCompatibilityHost(host)).slice(0,12000).map(host=>({category:source.category,host,domainType:'thirdParty',types:['script','xmlhttprequest','ping','image','other']}));
}

function parseRemote(text,source){
  if(source.kind==='disconnect')return parseDisconnect(text,source);
  const specs=[];const seen=new Set();const max=5000;
  for(const raw of String(text||'').split(/\r?\n/)){
    const line=raw.trim();if(!line||line.startsWith('!')||line.startsWith('#')||line.startsWith('[')||line.startsWith('@@')||line.includes('##')||line.includes('#@#')||line.startsWith('/'))continue;
    if(source.kind==='hosts'){
      const parts=line.split(/\s+/);let host='';
      if(parts.length>=2&&/^(?:0\.0\.0\.0|127\.0\.0\.1|::1|0:0:0:0:0:0:0:1)$/.test(parts[0]))host=validHost(parts[1]);
      else if(parts.length===1)host=validHost(parts[0]);
      if(host&&!COMPATIBILITY_HOSTS.has(host)){
        const spec={category:source.category,host,domainType:'thirdParty',types:RESOURCE_TYPES.filter(t=>t!=='main_frame')};const key=JSON.stringify(spec);if(!seen.has(key)){seen.add(key);specs.push(spec);}
      }
      if(specs.length>=max)break;continue;
    }
    const split=line.split('$');const pattern=split[0].trim();const options=(split[1]||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    if(!pattern||options.some(x=>x.startsWith('~')||['badfilter','match-case','important','redirect','redirect-rule','csp','removeparam','replace','upgrade','rewrite','empty','mp4','hls','popup'].includes(x)))continue;
    const typeMap={document:'main_frame',subdocument:'sub_frame',stylesheet:'stylesheet',script:'script',image:'image',font:'font',object:'object',xmlhttprequest:'xmlhttprequest',ping:'ping',media:'media',websocket:'websocket',other:'other'};
    const typeOpts=options.filter(x=>x in typeMap);const types=typeOpts.map(x=>typeMap[x]).filter(t=>KNOWN_TYPES.has(t)&&t!=='main_frame');
    if(typeOpts.length&&!types.length)continue;
    const domainOpt=options.find(x=>x.startsWith('domain='));let include=[],exclude=[];
    if(domainOpt){for(const d of domainOpt.slice(7).split('|')){const ex=d.startsWith('~');const host=validHost(ex?d.slice(1):d);if(host)(ex?exclude:include).push(host);}}
    const hostOnly=pattern.match(/^\|\|([a-z0-9.-]+)\^$/i);
    let spec;
    if(hostOnly){const host=validHost(hostOnly[1]);if(!host||COMPATIBILITY_HOSTS.has(host))continue;spec={category:source.category,host,domainType:'thirdParty',types:types.length?types:RESOURCE_TYPES.filter(t=>t!=='main_frame'),include,exclude};}
    else if(pattern.startsWith('||')){
      const hostMatch=pattern.match(/^\|\|([a-z0-9.-]+)(.*)$/i);if(!hostMatch)continue;
      const host=validHost(hostMatch[1]);if(!host||COMPATIBILITY_HOSTS.has(host))continue;
      spec={category:source.category,host,path:hostMatch[2].replace(/\^.*$/,'').replace(/\*/g,''),urlFilter:pattern,domainType:'thirdParty',types:types.length?types:RESOURCE_TYPES.filter(t=>t!=='main_frame'),include,exclude};
      if(spec.path==='/')spec.path='';
    } else {
      if(!/[\/^*]/.test(pattern)||pattern.length<4)continue;
      spec={category:source.category,urlFilter:pattern,domainType:'thirdParty',types:types.length?types:RESOURCE_TYPES.filter(t=>t!=='main_frame'),include,exclude};
    }
    const key=JSON.stringify(spec);if(!seen.has(key)){seen.add(key);specs.push(spec);}if(specs.length>=max)break;
  }
  return specs;
}
async function updateFilters(){
  const next=[];const updated=[];const errors=[];const nextStatus={...sourceStatus};const successfulCategories=new Set();const fallbackCategories=new Set();
  for(const source of SOURCES){
    try{
      const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);
      let response;
      try { response=await fetch(source.url,{signal:controller.signal,cache:'no-store',credentials:'omit'}); }
      finally { clearTimeout(timeout); }
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const text=await response.text();
      if(text.length<80||text.length>30000000)throw new Error('Unexpected list size; refused to import it');
      const parsed=parseRemote(text,source);
      const sourceLimit=SOURCE_RULE_LIMITS[source.id]||2000;
      const accepted=parsed.slice(0,sourceLimit);
      if(!accepted.length)throw new Error('No supported rules found');
      next.push(...accepted);successfulCategories.add(source.category);
      nextStatus[source.id]={label:source.label,count:accepted.length,updatedAt:Date.now(),ok:true,error:'',note:source.note};updated.push(source.id);
    }catch(error){
      nextStatus[source.id]={label:source.label,count:sourceStatus[source.id]?.count||0,updatedAt:sourceStatus[source.id]?.updatedAt||0,ok:!!sourceStatus[source.id]?.ok,error:String(error.message||error).slice(0,160),note:source.note};
      errors.push(`${source.label}: ${String(error.message||error).slice(0,100)}`);
      if(!successfulCategories.has(source.category)&&!fallbackCategories.has(source.category)){
        next.push(...remoteSpecs.filter(s=>s.category===source.category).slice(0,sourceLimitForCategory(source.category)));
        fallbackCategories.add(source.category);
      }
    }
  }
  // Deduplicate identical records from overlapping feeds before installing rules.
  const unique=[];const seen=new Set();
  for(const spec of next){const key=JSON.stringify(spec);if(seen.has(key))continue;seen.add(key);unique.push(spec);}
  remoteSpecs=unique.slice(0,REMOTE_RULE_LIMIT);sourceStatus=nextStatus;refreshThreatHostSets();
  await chrome.storage.local.set({remoteRuleCache:remoteSpecs,sourceStatus});
  await syncRules();await chrome.storage.local.set({stats,requestLog:requestLog.slice(0,500)});
  return {updated,errors,state:await getState()};
}
function sourceLimitForCategory(category){
  if(category==='ads')return SOURCE_RULE_LIMITS.easylist;
  if(category==='trackers')return 5000;
  if(category==='annoyances')return SOURCE_RULE_LIMITS['fanboy-annoyance'];
  if(category==='malware')return SOURCE_RULE_LIMITS['malware-domains'];
  return 2000;
}
async function loadState(){
  const stored=await chrome.storage.local.get(['settings','stats','requestLog','sourceStatus','remoteRuleCache','uiSettingsRevision']);
  settings={...DEFAULTS,...(stored.settings||{})};
  if(stored.uiSettingsRevision!=='0.2.4'){
    if(stored.settings&&stored.settings.showPageBadge===true)settings.showPageBadge=false;
    await chrome.storage.local.set({settings,uiSettingsRevision:'0.2.4'});
  }
  if(stored.stats)stats={...emptyStats(),...stored.stats,byCategory:{...emptyStats().byCategory,...(stored.stats.byCategory||{})},bySite:{...(stored.stats.bySite||{})},trackerDomains:Array.isArray(stored.stats.trackerDomains)?[...new Set(stored.stats.trackerDomains)].slice(-5000):[]};
  if(Array.isArray(stored.requestLog))requestLog=stored.requestLog.slice(0,500);
  sourceStatus=stored.sourceStatus||{};remoteSpecs=Array.isArray(stored.remoteRuleCache)?stored.remoteRuleCache.slice(0,REMOTE_RULE_LIMIT):[];refreshThreatHostSets();
  await chrome.storage.local.set({settings});await syncRules();
}
function allowedUrl(url){try{return ['http:','https:'].includes(new URL(url).protocol);}catch{return false;}}
async function suppressionKey(tabId,pageHost,sourceHost){const all=await chrome.storage.session.get('scriptSuppressions');return (all.scriptSuppressions||{})[`${tabId}|${pageHost}|${sourceHost}`]||0;}
async function suppressed(tabId,pageHost,sourceHost){const expiry=await suppressionKey(tabId,pageHost,sourceHost);return expiry>Date.now();}
async function createWarning(tabId,kind,destination,source=''){
  if(!Number.isInteger(tabId)||tabId<0||!allowedUrl(destination))return;
  const active=activeWarnings.get(tabId);if(active)return;
  const id=`${Date.now().toString(36)}-${crypto.randomUUID().slice(0,12)}`;
  const pending={id,kind,destination,source:validHost(source)||'',createdAt:Date.now()};
  await chrome.storage.session.set({[`warning_${id}`]:pending});activeWarnings.set(tabId,id);
  await chrome.tabs.update(tabId,{url:chrome.runtime.getURL(`warning.html?id=${encodeURIComponent(id)}`)});
}
async function navigateMalwareScript(tabId,pageUrl,source){
  if(!settings.warnMaliciousScripts||!allowedUrl(pageUrl)||!source)return;
  if(await suppressed(tabId,hostOf(pageUrl),source))return;
  await createWarning(tabId,'malware-script',pageUrl,source);
}
async function messageHandler(message,sender){
  switch(message?.type){
    case 'GET_STATE': return getState(message.host||'');
    case 'GET_TAB_STATS': {
      const tabId=sender?.tab?.id;const value=await getTabStats(tabId);
      let nativeBlockedTotal=0;
      if(Number.isInteger(tabId)&&tabId>=0){try{const txt=await chrome.action.getBadgeText({tabId});nativeBlockedTotal=String(txt||'').endsWith('+')?999:Math.max(0,Number(txt)||0);}catch{}}
      return {...value,nativeCounterAvailable:true,nativeBlockedTotal};
    }
    case 'OPEN_DASHBOARD': await chrome.runtime.openOptionsPage();return {ok:true};
    case 'COSMETIC_BLOCK': return recordCosmetic(sender);
    case 'MALICIOUS_SCRIPT_DETECTED': {
      const tabId=sender?.tab?.id;const source=validHost(message.source);const pageUrl=String(message.pageUrl||sender?.tab?.url||'');
      if(Number.isInteger(tabId)&&source&&settings.enabled&&settings.blockMalware&&isKnownMalwareHost(source))await navigateMalwareScript(tabId,pageUrl,source);
      return {ok:true};
    }
    case 'GET_WARNING_DATA': {const id=String(message.warningId||'');const entry=(await chrome.storage.session.get(`warning_${id}`))[`warning_${id}`];if(!entry||Date.now()-entry.createdAt>300000)throw new Error('This warning has expired. Go back and open the site again.');return {kind:entry.kind,destination:entry.destination,source:entry.source};}
    case 'WARNING_CONTINUE': {
      const tabId=Number(message.tabId);const id=String(message.warningId||'');const key=`warning_${id}`;const entry=(await chrome.storage.session.get(key))[key];if(!entry||!Number.isInteger(tabId)||tabId<0||!allowedUrl(entry.destination))throw new Error('Could not identify this warning or its destination.');
      if(entry.kind==='http') {
        const all=(await chrome.storage.session.get('httpSuppressions')).httpSuppressions||{};all[`${tabId}|${hostOf(entry.destination)}`]=Date.now()+30000;await chrome.storage.session.set({httpSuppressions:all});
      } else if(entry.kind==='malware-script'){
        const all=(await chrome.storage.session.get('scriptSuppressions')).scriptSuppressions||{};all[`${tabId}|${hostOf(entry.destination)}|${validHost(entry.source)||''}`]=Date.now()+SUPPRESSION_MINUTES*60000;await chrome.storage.session.set({scriptSuppressions:all});
      } else if(entry.kind==='malware-site') {
        const all=(await chrome.storage.session.get('siteSuppressions')).siteSuppressions||{};all[`${tabId}|${hostOf(entry.destination)}`]=Date.now()+SUPPRESSION_MINUTES*60000;await chrome.storage.session.set({siteSuppressions:all});
      }
      await chrome.storage.session.remove(key);activeWarnings.delete(tabId);await chrome.tabs.update(tabId,{url:entry.destination});return {ok:true};
    }
    case 'WARNING_BACK': {
      const tabId=Number(message.tabId);const key=`warning_${String(message.warningId||'')}`;await chrome.storage.session.remove(key);activeWarnings.delete(tabId);await chrome.tabs.update(tabId,{url:'chrome://newtab/'});return {ok:true};
    }
    case 'SET_LANGUAGE': if(!['en','pt-BR'].includes(message.language))throw new Error('Unsupported language');settings.language=message.language;await chrome.storage.local.set({settings});return getState();
    case 'SET_SETTING': {
      const allowed=new Set(Object.keys(DEFAULTS).filter(k=>typeof DEFAULTS[k]==='boolean'));if(!allowed.has(message.key))throw new Error('Unknown setting');settings[message.key]=!!message.value;await chrome.storage.local.set({settings});await syncRules();
      if(message.key==='showTrackerCount'||message.key==='enabled'){const tabs=await chrome.tabs.query({});for(const tab of tabs)if(Number.isInteger(tab.id))void updateActionBadge(tab.id);}
      return getState();
    }
    case 'SITE_TOGGLE': {const host=validHost(message.host);if(!host)throw new Error('Invalid hostname');settings.pausedSites=(settings.pausedSites||[]).filter(h=>h!==host);if(!message.active)settings.pausedSites.push(host);await chrome.storage.local.set({settings});await rebuildDynamicRules();return getState();}
    case 'ADD_ALLOW': {const host=validHost(message.host);if(!host)throw new Error('Enter a hostname such as example.com');if(!settings.allowlistDomains.includes(host))settings.allowlistDomains.push(host);await chrome.storage.local.set({settings});await rebuildDynamicRules();return getState();}
    case 'REMOVE_ALLOW': settings.allowlistDomains=settings.allowlistDomains.filter(h=>h!==message.host);await chrome.storage.local.set({settings});await rebuildDynamicRules();return getState();
    case 'ADD_BLOCK': {const host=validHost(message.host);if(!host)throw new Error('Enter a hostname such as ads.example.com');if(!settings.customBlockedHosts.includes(host))settings.customBlockedHosts.push(host);refreshThreatHostSets();await chrome.storage.local.set({settings});await rebuildDynamicRules();return getState();}
    case 'REMOVE_BLOCK': settings.customBlockedHosts=settings.customBlockedHosts.filter(h=>h!==message.host);refreshThreatHostSets();await chrome.storage.local.set({settings});await rebuildDynamicRules();return getState();
    case 'UPDATE_FILTERS': return updateFilters();
    case 'CLEAR_LOGS': requestLog=[];await chrome.storage.local.set({requestLog});return getState();
    case 'RESET_STATS': stats=emptyStats();await chrome.storage.local.set({stats});return getState();
    case 'IMPORT_SETTINGS': {const incoming=message.data||{};settings={...DEFAULTS,...incoming};for(const k of ['allowlistDomains','pausedSites','customBlockedHosts'])settings[k]=[...new Set((settings[k]||[]).map(validHost).filter(Boolean))].slice(0,1000);refreshThreatHostSets();await chrome.storage.local.set({settings});await syncRules();return getState();}
    case 'IMPORT_BACKUP': {const incoming=message.data||{};settings={...DEFAULTS,...(incoming.settings||incoming)};for(const k of ['allowlistDomains','pausedSites','customBlockedHosts'])settings[k]=[...new Set((settings[k]||[]).map(validHost).filter(Boolean))].slice(0,1000);if(Array.isArray(incoming.remoteRuleCache))remoteSpecs=incoming.remoteRuleCache.slice(0,REMOTE_RULE_LIMIT);refreshThreatHostSets();if(incoming.stats)stats={...emptyStats(),...incoming.stats,byCategory:{...emptyStats().byCategory,...(incoming.stats.byCategory||{})},bySite:{...(incoming.stats.bySite||{})},trackerDomains:Array.isArray(incoming.stats.trackerDomains)?incoming.stats.trackerDomains.slice(-5000):[]};if(Array.isArray(incoming.requestLog))requestLog=incoming.requestLog.slice(0,500);await chrome.storage.local.set({settings,remoteRuleCache:remoteSpecs,stats,requestLog});await syncRules();return getState();}
    case 'EXPORT_DATA': return {app:'Sentinel Shield',version:'0.2.4-chrome',exportedAt:new Date().toISOString(),settings,stats,requestLog:requestLog.slice(0,500),sourceStatus,remoteRuleCache:remoteSpecs};
    default: throw new Error('Unsupported message');
  }
}
chrome.runtime.onMessage.addListener((message,sender)=>messageHandler(message,sender));
chrome.webRequest.onBeforeRequest.addListener((details)=>{
  if(!details.url||!/^https?:/i.test(details.url)||!settings.enabled)return;
  const type=typeName(details.type||'other');
  if(type==='main_frame')return; // Main-frame threats are interrupted by webNavigation before commit.
  const matched=matchRequest(details);if(!matched)return;
  void recordEvent(details,matched);
  if(matched.category==='malware'&&matched.type==='script'&&matched.reason!=='strict third-party script guard')void navigateMalwareScript(details.tabId,details.documentUrl||details.initiator||'',matched.targetHost);
},{urls:['http://*/*','https://*/*']});
chrome.webNavigation.onBeforeNavigate.addListener(async details=>{
  if(details.frameId!==0||!settings.enabled||!allowedUrl(details.url))return;
  const host=hostOf(details.url);if(!host)return;
  const siteSuppressions=(await chrome.storage.session.get('siteSuppressions')).siteSuppressions||{};
  if((siteSuppressions[`${details.tabId}|${host}`]||0)>Date.now())return;
  const httpSuppressions=(await chrome.storage.session.get('httpSuppressions')).httpSuppressions||{};
  if(/^http:/i.test(details.url)&&(httpSuppressions[`${details.tabId}|${host}`]||0)>Date.now())return;
  const direct=isKnownMalwareHost(host);
  if(settings.blockMalware&&direct&&settings.warnMaliciousScripts){await createWarning(details.tabId,'malware-site',details.url,host);return;}
  if(settings.warnHttp&&/^http:/i.test(details.url)&&!['localhost','127.0.0.1'].includes(host)&&!host.startsWith('192.168.')){
    // This MV3 fallback runs on navigation start; HTTP redirects to HTTPS can also cause a warning.
    // It is intentionally disclosed as a Chrome-specific limitation in the README.
    await createWarning(details.tabId,'http',details.url,host);
  }
});
chrome.tabs.onRemoved.addListener(async tabId=>{tabStats.delete(tabId);tabStatsLoaded.delete(tabId);await chrome.storage.session.remove(`tabStats_${tabId}`);activeWarnings.delete(tabId);});
chrome.tabs.onUpdated.addListener((tabId,changeInfo,tab)=>{
  if(changeInfo.status==='loading'&&tab?.url&&!String(tab.url).startsWith(chrome.runtime.getURL(''))){
    // Clear per-page custom counters; Chrome's native DNR action counter resets per page independently.
    const key=`tabStats_${tabId}`;void chrome.storage.session.set({[key]:emptyTabStats()});tabStats.set(tabId,emptyTabStats());tabStatsLoaded.add(tabId);void publishTabStats(tabId);
  }
  if(changeInfo.url&&String(changeInfo.url).includes('warning.html'))return;
  if(changeInfo.url&&activeWarnings.has(tabId))activeWarnings.delete(tabId);
});
async function bootEngine(){
  if(!bootPromise)bootPromise=(async()=>{await loadPackagedFilters();await loadState();})();
  return bootPromise;
}
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='local'&&changes.settings?.newValue)settings={...DEFAULTS,...changes.settings.newValue};
});
chrome.runtime.onInstalled.addListener(()=>{void bootEngine().catch(error=>console.error('[Sentinel] Chrome install boot failed',error));});
chrome.runtime.onStartup.addListener(()=>{void bootEngine().catch(error=>console.error('[Sentinel] Chrome startup boot failed',error));});
void bootEngine().catch(error=>console.error('[Sentinel] Chrome engine boot failed',error));
