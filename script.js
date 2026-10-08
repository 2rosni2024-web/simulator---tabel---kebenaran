(function(){
  "use strict";
  // ---------- Tokenizer ----------
  function tokenize(s){
    var out=[], i=0, m;
    var rules=[
      [/^(<->|<=>|↔)/,"IFF"],[/^(->|=>|→)/,"IMP"],[/^(&&|&|∧)/,"AND"],[/^(\|\||\||∨)/,"OR"],
      [/^(!|~|¬)/,"NOT"],[/^(\^|⊕)/,"XOR"],[/^\(/,"LP"],[/^\)/,"RP"]
    ];
    while(i<s.length){
      var rest=s.slice(i);
      if(/^\s/.test(rest)){i++;continue;}
      var hit=false;
      for(var k=0;k<rules.length;k++){
        if((m=rest.match(rules[k][0]))){out.push({t:rules[k][1],pos:i});i+=m[0].length;hit=true;break;}
      }
      if(hit)continue;
      if((m=rest.match(/^[A-Za-z_][A-Za-z0-9_]*/))){
        var w=m[0], u=w.toUpperCase();
        if(u==="AND"||u==="OR"||u==="NOT"||u==="XOR") out.push({t:u,pos:i});
        else out.push({t:"VAR",v:w,pos:i});
        i+=w.length;continue;
      }
      throw new Error("Karakter '"+rest[0]+"' pada posisi "+(i+1)+" tidak dikenali.");
    }
    return out;
  }
  // ---------- Parser ----------
  function parse(tokens){
    var p=0;
    function peek(){return tokens[p]?tokens[p].t:null;}
    function eat(t){
      if(peek()!==t) throw new Error(t==="RP"?"Tanda kurung buka tidak punya pasangan penutup.":"Ekspresi tidak lengkap atau urutannya salah.");
      return tokens[p++];
    }
    function left(next,type){
      return function(){
        var n=next();
        while(peek()===type){p++; n={t:"bin",op:type,l:n,r:next()};}
        return n;
      };
    }
    function imp(){
      var l=or();
      if(peek()==="IMP"){p++; return {t:"bin",op:"IMP",l:l,r:imp()};}
      return l;
    }
    function not(){
      if(peek()==="NOT"){p++; return {t:"not",a:not()};}
      return atom();
    }
    function atom(){
      var k=peek();
      if(k==="VAR") return {t:"var",n:tokens[p++].v};
      if(k==="LP"){p++; var n=iff(); eat("RP"); return n;}
      throw new Error(k===null?"Ekspresi berakhir terlalu cepat.":"Operator berada di tempat yang tidak tepat.");
    }
    var and=left(not,"AND"), xor=left(and,"XOR"), or=left(xor,"OR"), iff=left(imp,"IFF");
    if(!tokens.length) throw new Error("Ekspresi masih kosong.");
    var tree=iff();
    if(p<tokens.length) throw new Error(tokens[p].t==="RP"?"Tanda kurung tutup berlebih.":"Ada bagian ekspresi yang tidak terbaca.");
    return tree;
  }
  // ---------- Evaluasi ----------
  var SYM={AND:"∧",OR:"∨",XOR:"⊕",IMP:"→",IFF:"↔"};
  function str(n,top){
    if(n.t==="var") return n.n;
    if(n.t==="not") return "¬"+str(n.a,false);
    var s=str(n.l,false)+" "+SYM[n.op]+" "+str(n.r,false);
    return top?s:"("+s+")";
  }
  function ev(n,env){
    if(n.t==="var") return env[n.n];
    if(n.t==="not") return !ev(n.a,env);
    var a=ev(n.l,env), b=ev(n.r,env);
    switch(n.op){
      case "AND":return a&&b; case "OR":return a||b; case "XOR":return a!==b;
      case "IMP":return !a||b; case "IFF":return a===b;
    }
  }
  function collect(n,vars,subs,seen){
    if(n.t==="var"){ if(vars.indexOf(n.n)<0) vars.push(n.n); return; }
    if(n.t==="not") collect(n.a,vars,subs,seen);
    else { collect(n.l,vars,subs,seen); collect(n.r,vars,subs,seen); }
    var key=str(n,true);
    if(!seen[key]){seen[key]=1; subs.push({node:n,label:str(n,true)});}
  }
  // ---------- UI ----------
  var $=function(id){return document.getElementById(id);};
  var state={data:null,fmt:"TF",filter:"all",steps:true};

  function build(){
    var src=$("expr").value, err=$("err");
    err.hidden=true;
    try{
      var tree=parse(tokenize(src));
      var vars=[],subs=[];
      collect(tree,vars,subs,{});
      vars.sort();
      if(vars.length>6) throw new Error("Terlalu banyak variabel ("+vars.length+"). Batasnya 6.");
      if(!vars.length) throw new Error("Tambahkan setidaknya satu variabel, misalnya P atau Q.");
      var rows=[], n=vars.length, total=1<<n;
      for(var i=0;i<total;i++){
        var env={};
        for(var j=0;j<n;j++) env[vars[j]]=!((i>>(n-1-j))&1);
        rows.push({env:env, steps:subs.map(function(s){return ev(s.node,env);}), res:ev(tree,env)});
      }
      state.data={vars:vars,subs:subs,rows:rows,tree:tree};
      render();
    }catch(e){
      err.textContent=e.message; err.hidden=false;
      state.data=null;
      $("controls").hidden=true; $("tablewrap").hidden=true; $("count").textContent="";
    }
  }
  function cell(v,final){
    var s=document.createElement("span");
    s.className="cell "+(v?"t":"f");
    s.textContent=state.fmt==="TF"?(v?"T":"F"):(v?"1":"0");
    return s;
  }
  function render(){
    var d=state.data; if(!d) return;
    var tbl=$("tbl"); tbl.innerHTML="";
    var showSteps=state.steps && d.subs.length>1;
    var mid=showSteps?d.subs.slice(0,-1):[];
    var thead=document.createElement("thead"), hr=document.createElement("tr");
    d.vars.forEach(function(v){var th=document.createElement("th");th.className="vars";th.textContent=v;hr.appendChild(th);});
    mid.forEach(function(s){var th=document.createElement("th");th.textContent=s.label;hr.appendChild(th);});
    var fin=document.createElement("th");fin.className="final";fin.textContent=d.subs[d.subs.length-1].label;hr.appendChild(fin);
    thead.appendChild(hr); tbl.appendChild(thead);
    var tb=document.createElement("tbody"), shown=0;
    d.rows.forEach(function(r){
      if(state.filter==="t"&&!r.res) return;
      if(state.filter==="f"&&r.res) return;
      shown++;
      var tr=document.createElement("tr");
      d.vars.forEach(function(v){var td=document.createElement("td");td.appendChild(cell(r.env[v]));tr.appendChild(td);});
      mid.forEach(function(s,i){var td=document.createElement("td");td.appendChild(cell(r.steps[i]));tr.appendChild(td);});
      var tf=document.createElement("td");tf.className="final";tf.appendChild(cell(r.res));tr.appendChild(tf);
      tb.appendChild(tr);
    });
    if(!shown){
      var tr=document.createElement("tr"),td=document.createElement("td");
      td.colSpan=d.vars.length+mid.length+1;td.className="empty";
      td.textContent="Tidak ada baris yang cocok dengan penyaringan ini.";
      tr.appendChild(td);tb.appendChild(tr);
    }
    tbl.appendChild(tb);
    var trues=d.rows.filter(function(r){return r.res;}).length, all=d.rows.length;
    $("verdict").textContent = trues===all?"Tautologi (selalu benar)":trues===0?"Kontradiksi (selalu salah)":"Kontingensi (kadang benar, kadang salah)";
    $("count").textContent="Menampilkan "+shown+" dari "+all+" baris. Hasil benar: "+trues+", salah: "+(all-trues)+".";
    $("controls").hidden=false; $("tablewrap").hidden=false;
  }
  function pressGroup(selector,activeEl){
    document.querySelectorAll(selector).forEach(function(b){b.setAttribute("aria-pressed",b===activeEl?"true":"false");});
  }
  $("go").addEventListener("click",build);
  $("expr").addEventListener("keydown",function(e){if(e.key==="Enter")build();});
  $("expr").addEventListener("input",build);
  document.querySelectorAll("[data-ins]").forEach(function(b){
    b.addEventListener("click",function(){
      var el=$("expr"), s=el.selectionStart==null?el.value.length:el.selectionStart, e=el.selectionEnd==null?s:el.selectionEnd;
      var t=b.getAttribute("data-ins");
      el.value=el.value.slice(0,s)+t+el.value.slice(e);
      el.focus(); el.setSelectionRange(s+t.length,s+t.length); build();
    });
  });
  document.querySelectorAll("[data-ex]").forEach(function(b){
    b.addEventListener("click",function(){$("expr").value=b.getAttribute("data-ex");build();});
  });
  $("fmtTF").addEventListener("click",function(){state.fmt="TF";pressGroup("#fmtTF,#fmt01",this);render();});
  $("fmt01").addEventListener("click",function(){state.fmt="01";pressGroup("#fmtTF,#fmt01",this);render();});
  document.querySelectorAll("[data-filter]").forEach(function(b){
    b.addEventListener("click",function(){state.filter=b.getAttribute("data-filter");pressGroup("[data-filter]",b);render();});
  });
  $("steps").addEventListener("click",function(){
    state.steps=!state.steps;this.setAttribute("aria-pressed",state.steps?"true":"false");render();
  });
  $("theme").addEventListener("click",function(){
    var dark=this.getAttribute("aria-pressed")!=="true";
    this.setAttribute("aria-pressed",dark?"true":"false");
    this.textContent=dark?"Mode terang":"Mode gelap";
    document.documentElement.setAttribute("data-theme",dark?"dark":"light");
  });
  build();
})();
