/* N2K RNS Gateway · Monitoring module
   1.30.38-beta1
   Read-only: GET endpoints + browser-local history only. */
(function(){
  "use strict";

  var HISTORY_KEY="n2k.monitor.history.v1";
  var PATHS_KEY="n2k.monitor.paths.v1";
  var SAMPLE_INTERVAL=120000;
  var MAX_AGE=24*60*60*1000;
  var MAX_SAMPLES=720;
  var currentSnapshot=null;
  var running=false;

  function byId(id){
    return document.getElementById(id);
  }

  function text(id,value){
    var node=byId(id);
    if(node) node.textContent=(value===null||value===undefined||value==="")?"—":String(value);
  }

  function number(value,fallback){
    var n=Number(value);
    return Number.isFinite(n)?n:(fallback||0);
  }

  function readJson(key,fallback){
    try{
      var raw=localStorage.getItem(key);
      if(!raw) return fallback;
      var value=JSON.parse(raw);
      return value===null||value===undefined?fallback:value;
    }catch(_){
      return fallback;
    }
  }

  function writeJson(key,value){
    try{
      localStorage.setItem(key,JSON.stringify(value));
      return true;
    }catch(_){
      return false;
    }
  }

  function history(){
    var items=readJson(HISTORY_KEY,[]);
    return Array.isArray(items)?items:[];
  }

  function trimHistory(items,now){
    var cutoff=now-MAX_AGE;
    return items
      .filter(function(item){
        return item&&number(item.t,0)>=cutoff;
      })
      .slice(-MAX_SAMPLES);
  }

  async function getJson(url){
    var response=await fetch(
      url+(url.indexOf("?")>=0?"&":"?")+"n2kmon="+Date.now(),
      {cache:"no-store"}
    );
    if(!response.ok){
      throw new Error("HTTP "+response.status);
    }
    return response.json();
  }

  function isUp(item){
    var state=String(item&&item.status||"").trim().toLowerCase();
    return state==="up"||state==="online"||state==="connected";
  }

  function formatPercent(value){
    if(value===null||value===undefined||!Number.isFinite(Number(value))) return "—";
    return Math.round(Number(value))+"%";
  }

  function formatDbm(value){
    if(value===null||value===undefined||!Number.isFinite(Number(value))) return "—";
    return Math.round(Number(value))+" dBm";
  }

  function avg(values){
    if(!values.length) return 0;
    return values.reduce(function(a,b){return a+b;},0)/values.length;
  }

  function previousPaths(){
    var list=readJson(PATHS_KEY,[]);
    return Array.isArray(list)?list:[];
  }

  function pathSet(paths){
    var out=[];
    var seen=Object.create(null);
    paths.forEach(function(item){
      var value=String(item&&item.destination||"").trim().toLowerCase();
      if(value&&!seen[value]){
        seen[value]=true;
        out.push(value);
      }
    });
    return out;
  }

  function churn(current,previous){
    var cur=Object.create(null);
    var prev=Object.create(null);
    current.forEach(function(v){cur[v]=true;});
    previous.forEach(function(v){prev[v]=true;});
    var added=0;
    var gone=0;
    current.forEach(function(v){if(!prev[v]) added++;});
    previous.forEach(function(v){if(!cur[v]) gone++;});
    return {added:added,gone:gone};
  }

  function analyze(network,status){
    var paths=Array.isArray(network&&network.paths)?network.paths:[];
    var interfaces=Array.isArray(status&&status.interfaces)?status.interfaces:[];
    var hops=[];
    var nextHops=Object.create(null);
    var interfacesUsed=Object.create(null);

    paths.forEach(function(path){
      var hop=Number(path&&path.hops);
      if(Number.isFinite(hop)) hops.push(hop);

      var relay=String(path&&path.next_hop||"").trim().toLowerCase();
      if(relay){
        nextHops[relay]=(nextHops[relay]||0)+1;
      }

      var iface=String(path&&path.interface||"").trim();
      if(iface){
        interfacesUsed[iface]=(interfacesUsed[iface]||0)+1;
      }
    });

    var relayValues=Object.keys(nextHops).map(function(key){return nextHops[key];});
    var dominantRelay=relayValues.length?Math.max.apply(Math,relayValues):0;
    var relayShare=paths.length?(dominantRelay/paths.length)*100:0;

    var currentPathList=pathSet(paths);
    var oldPathList=previousPaths();
    var delta=churn(currentPathList,oldPathList);
    writeJson(PATHS_KEY,currentPathList);

    var rnode=interfaces.find(function(item){
      var marker=(
        String(item&&item.type||"")+" "+
        String(item&&item.name||"")
      ).toLowerCase();
      return marker.indexOf("rnode")>=0;
    })||null;

    var online=Boolean(status&&status.online);
    var upCount=interfaces.filter(isUp).length;

    return {
      t:Date.now(),
      online:online,
      paths:number(network&&network.path_count,paths.length),
      interfacesUp:upCount,
      interfacesTotal:interfaces.length,
      tx:number(network&&network.tx_bytes,0),
      rx:number(network&&network.rx_bytes,0),
      avgHops:hops.length?avg(hops):0,
      maxHops:hops.length?Math.max.apply(Math,hops):0,
      directPaths:hops.filter(function(v){return v<=1;}).length,
      relayShare:relayShare,
      interfaceKinds:Object.keys(interfacesUsed).length,
      newPaths:oldPathList.length?delta.added:0,
      gonePaths:oldPathList.length?delta.gone:0,
      networkErrors:Array.isArray(network&&network.errors)?network.errors.length:0,
      rnodePresent:Boolean(rnode),
      rnodeUp:Boolean(rnode&&isUp(rnode)),
      noise:rnode&&Number.isFinite(Number(rnode.noise_floor_dbm))?Number(rnode.noise_floor_dbm):null,
      channelLoad:rnode&&Number.isFinite(Number(rnode.channel_load_15s_percent))?Number(rnode.channel_load_15s_percent):null,
      airtime:rnode&&Number.isFinite(Number(rnode.airtime_15s_percent))?Number(rnode.airtime_15s_percent):null
    };
  }

  function availability(items){
    if(!items.length) return null;
    var good=items.filter(function(item){return Boolean(item&&item.online);}).length;
    return (good/items.length)*100;
  }

  function sampleNear(items,target){
    if(!items.length) return null;
    var candidate=null;
    for(var i=items.length-1;i>=0;i--){
      if(number(items[i].t,0)<=target){
        candidate=items[i];
        break;
      }
    }
    return candidate||items[0];
  }

  function pathTrend(items,current){
    if(!items.length) return {delta:0,label:"Startwert"};
    var old=sampleNear(items,Date.now()-60*60*1000);
    if(!old) return {delta:0,label:"Startwert"};
    var span=Date.now()-number(old.t,Date.now());
    var delta=number(current.paths,0)-number(old.paths,0);
    var prefix=delta>0?"+":"";
    return {
      delta:delta,
      label:span>=45*60*1000
        ?prefix+delta+" in 1 h"
        :prefix+delta+" seit Start"
    };
  }

  function relayRisk(share){
    if(share>=70) return {label:"HOCH",className:"risk-high"};
    if(share>=45) return {label:"MITTEL",className:"risk-medium"};
    return {label:"VERTEILT",className:"risk-low"};
  }

  function renderSpark(items){
    var svg=byId("n2k-mon-spark-paths");
    var trace=byId("n2k-mon-spark-paths-trace");
    if(!svg||!trace) return;

    var data=items.slice(-120);
    if(data.length<2){
      trace.setAttribute("d","");
      return;
    }

    var values=data.map(function(item){return number(item.paths,0);});
    var min=Math.min.apply(Math,values);
    var max=Math.max.apply(Math,values);
    if(max===min){
      max=min+1;
      min=Math.max(0,min-1);
    }

    var width=240;
    var height=34;
    var pad=2;
    var points=values.map(function(value,index){
      var x=pad+(index/(values.length-1))*(width-pad*2);
      var y=height-pad-((value-min)/(max-min))*(height-pad*2);
      return [x,y];
    });

    var d=points.map(function(point,index){
      return (index===0?"M":"L")+point[0].toFixed(1)+" "+point[1].toFixed(1);
    }).join(" ");

    trace.setAttribute("d",d);
    text("n2k-mon-chart-range",min+"–"+Math.max.apply(Math,values)+" Pfade");
  }

  function renderMonitor(snapshot,items){
    var state=byId("n2k-monitor-state");
    var availabilityValue=availability(items);
    var trend=pathTrend(items,snapshot);

    text(
      "n2k-mon-health",
      availabilityValue===null?"—":Math.round(availabilityValue)+"%"
    );
    text(
      "n2k-mon-health-sub",
      snapshot.interfacesUp+"/"+snapshot.interfacesTotal+" Interfaces aktiv"
    );

    text("n2k-mon-paths",snapshot.paths);
    text("n2k-mon-paths-sub",trend.label);

    text(
      "n2k-mon-churn",
      "+"+snapshot.newPaths+" / −"+snapshot.gonePaths
    );
    text(
      "n2k-mon-churn-sub",
      "Pfadwechsel · Relay "+Math.round(snapshot.relayShare)+"%"
    );

    if(snapshot.rnodePresent){
      text(
        "n2k-mon-radio",
        snapshot.noise===null
          ?(snapshot.rnodeUp?"BEREIT":"OFFLINE")
          :formatDbm(snapshot.noise)
      );
      text(
        "n2k-mon-radio-sub",
        snapshot.channelLoad===null
          ?(snapshot.rnodeUp?"RNode aktiv":"RNode erkannt")
          :"Kanal "+formatPercent(snapshot.channelLoad)
      );
    }else{
      text("n2k-mon-radio","OPTIONAL");
      text("n2k-mon-radio-sub","Kein RNode erforderlich");
    }

    if(state){
      var healthy=snapshot.online&&snapshot.networkErrors===0;
      state.className="n2k-monitor-state "+(healthy?"ok":"warn");
      state.textContent=healthy?"STABIL":"PRÜFEN";
      state.title=snapshot.networkErrors
        ?snapshot.networkErrors+" Netzwerkfehler im letzten Snapshot"
        :"Read-only Monitoring aktiv";
    }

    text(
      "n2k-monitor-history-note",
      items.length+
      " lokale Messpunkte · Historie entsteht nur, solange die App geöffnet ist."
    );

    renderSpark(items);
  }

  function renderMesh(snapshot){
    if(!snapshot) return;

    var risk=relayRisk(snapshot.relayShare);
    var relayCard=byId("n2k-mi-relay-card");

    text("n2k-mi-paths",snapshot.paths);
    text(
      "n2k-mi-paths-sub",
      snapshot.interfaceKinds+" Interface-Typen"
    );

    text(
      "n2k-mi-hops",
      snapshot.avgHops?Number(snapshot.avgHops).toFixed(1):"0"
    );
    text(
      "n2k-mi-hops-sub",
      "max "+snapshot.maxHops+" Hops"
    );

    text(
      "n2k-mi-churn",
      "+"+snapshot.newPaths+" / −"+snapshot.gonePaths
    );
    text("n2k-mi-churn-sub","seit letzter Messung");

    text("n2k-mi-relay",risk.label);
    text(
      "n2k-mi-relay-sub",
      Math.round(snapshot.relayShare)+"% über stärksten Relay"
    );

    if(relayCard){
      relayCard.classList.remove("risk-low","risk-medium","risk-high");
      relayCard.classList.add(risk.className);
    }

    updateLiveOnly();
  }

  function updateLiveOnly(){
    var source=byId("n2k-map-live");
    text(
      "n2k-mi-live",
      source?source.textContent:"—"
    );

    var seen=byId("n2k-map-visible");
    text(
      "n2k-mi-live-sub",
      seen?(String(seen.textContent||"0")+" seen"):"Live aus Mesh-Ansicht"
    );
  }

  async function refresh(){
    if(running||document.hidden) return;
    running=true;

    try{
      var results=await Promise.all([
        getJson("api/network"),
        getJson("api/status")
      ]);

      var network=results[0]||{};
      var status=results[1]||{};
      var snapshot=analyze(network,status);
      currentSnapshot=snapshot;

      var items=trimHistory(history(),snapshot.t);
      items.push(snapshot);
      items=trimHistory(items,snapshot.t);
      writeJson(HISTORY_KEY,items);

      renderMonitor(snapshot,items);
      renderMesh(snapshot);
    }catch(error){
      var state=byId("n2k-monitor-state");
      if(state){
        state.className="n2k-monitor-state warn";
        state.textContent="OFFLINE";
        state.title=String(error&&error.message||error||"Monitoring nicht erreichbar");
      }
    }finally{
      running=false;
    }
  }

  function clearHistory(){
    try{
      localStorage.removeItem(HISTORY_KEY);
      localStorage.removeItem(PATHS_KEY);
    }catch(_){}
    refresh();
  }

  function boot(){
    var items=trimHistory(history(),Date.now());
    writeJson(HISTORY_KEY,items);
    if(items.length){
      currentSnapshot=items[items.length-1];
      renderMonitor(currentSnapshot,items);
      renderMesh(currentSnapshot);
    }

    updateLiveOnly();
    window.setInterval(updateLiveOnly,5000);
    window.setTimeout(refresh,2500);
    window.setInterval(refresh,SAMPLE_INTERVAL);

    document.addEventListener("visibilitychange",function(){
      if(!document.hidden){
        updateLiveOnly();
        refresh();
      }
    });
  }

  window.N2KMonitoring={
    refreshNow:refresh,
    clearHistory:clearHistory,
    version:"1.30.38-beta1"
  };

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",boot,{once:true});
  }else{
    boot();
  }
})();
