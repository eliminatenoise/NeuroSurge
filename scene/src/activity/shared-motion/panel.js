document.addEventListener("DOMContentLoaded", () => {
  "use strict";
  // Capture the unmodified public page before running examples or accepting reader input.
  const save = document.querySelector(".save");
  if (!document.querySelector("script[src]")) {
    const original = "<!doctype html>\n" + document.documentElement.outerHTML;
    save.href = URL.createObjectURL(new Blob([original], {type:"text/html;charset=utf-8"}));
  }
  let data;
  const byId = id => document.getElementById(id);
  const picker = byId("history-select");
  const source = byId("source-select");
  const drafts = new Map();
  const angleModes = [
    {id:"motion", width:2, label:"Movement only"},
    {id:"emg", width:6, label:"Movement + forearm EMG"},
    {id:"full", width:14, label:"Movement + forearm EMG + scalp EEG"}
  ];
  let revision = 0;
  let model;
  let practice = false;

  function element(tag, content, className) {
    const node = document.createElement(tag);
    if (content !== undefined) node.textContent = content;
    if (className) node.className = className;
    return node;
  }

  function format(value, places = 2) {
    if (Math.abs(value) >= 1e6) return value.toExponential(2);
    return value.toLocaleString("en", {useGrouping:false, minimumFractionDigits:places, maximumFractionDigits:places});
  }

  function studyTable() {
    const angleTable = byId("angle-bench").tBodies[0];
    for (const [key, label] of [
      ...angleModes.map(({id,label}) => ["pretrained."+id, label]),
      ["corrected.motion","Shared movement forecast + motion-only correction"],
      ["corrected.emg","Shared movement forecast + motion and forearm correction"],
      ["prior_motion_cnn","Wrist-specific convolutional network"],
      ["prior_emg_corrected_cnn","Wrist-specific network + forearm correction"],
      ["persistence","Repeat the cutoff angles"]
    ]) {
      const row = angleTable.insertRow();
      const th = element("th",label); th.scope = "row"; row.append(th);
      row.insertCell().textContent = format(data.angleScores[key],3);
    }
    const body = byId("bench").tBodies[0];
    for (const [key, title] of [
      ["joint", "Shared Transformer"], ["recent", "Keep the latest speed"],
      ["still", "Predict zero movement"], ["ridge_log", "Domain-only linear fit on log distance"],
      ["ridge_cm", "Domain-only linear fit on distance"], ["solo32", "One-domain Transformer · matched exposure"],
      ["solo64", "One-domain Transformer · matched batch size"]
    ]) {
      const tr = body.insertRow();
      const th = element("th",title);
      th.scope = "row";
      tr.append(th);
      for (const domain of ["wrist", "rat"]) tr.insertCell().textContent = format(data.aggregate[domain][key], 3);
    }
    const interval = (domain, arm) => data.aggregate[domain].intervals[arm]
      .map(value => (value > 0 ? "+" : "") + format(value, 3)).join(" to ");
    byId("intervals-report").textContent =
      "Against the matched-exposure Transformer, the paired intervals for shared minus single-domain error crossed zero in both cases. The wrist interval was " +
      interval("wrist","solo32") + " cm and the rat interval was " + interval("rat","solo32") +
      " cm. Against the matched-batch Transformer, the intervals were " + interval("wrist","solo64") +
      " cm and " + interval("rat","solo64") + " cm respectively.";
  }

  function meanMedianMax(values) {
    const sorted = values.slice().sort((a,b) => a-b);
    return [values.reduce((sum,v) => sum + v, 0) / 4, (sorted[1]+sorted[2])/2, sorted[3]];
  }

  function ridgeDistance(domain, intervals, recent) {
    const fit = data.ridge[domain];
    const lengths = intervals.map(row => row[0]);
    const scaled = intervals.map(row => .25 * row[0] / row[1]);
    const design = intervals.flatMap(([length, duration, age, twoStep, cosine],i) =>
      [Math.log1p(length), (duration-.25)/.05, age/.05, Math.log1p(twoStep), cosine, Math.log1p(scaled[i])]);
    design.push(...lengths, ...scaled, ...intervals.map(row => row[3]), recent, ...meanMedianMax(lengths), ...meanMedianMax(scaled));
    const logDistance = design.reduce((sum,v,i) => sum + (v-fit.mu[i])/fit.sd[i]*fit.coef[i], fit.intercept);
    const cm = Math.expm1(Math.max(0,logDistance));
    if (!Number.isFinite(cm)) throw new RangeError("The linear comparison exceeds the numerical range. Check the coordinate units.");
    return cm;
  }

  function plot(intervals, cm) {
    const node = byId("bars");
    const values = [...intervals.map(row => row[0]), cm];
    const max = Math.max(...values, Number.MIN_VALUE);
    node.replaceChildren();
    ["−0.75 s", "−0.50 s", "−0.25 s", "0 s", "+0.25 s"].forEach((end, i) => {
      const future = i === 4;
      const column = element("div", undefined, "bar-column"+(future ? " foreseen" : ""));
      column.setAttribute("aria-label", (future ? "Forecast" : "Past interval") +
        " ending at " + end + ", " + format(values[i]) + " centimetres");
      const number = element("span", format(values[i]));
      const track = element("div", undefined, "track");
      const fill = element("i", undefined, "fill");
      fill.style.height = (values[i]/max*100) + "%";
      track.append(fill);
      column.append(number, track, element("span",end));
      node.append(column);
    });
  }

  function featureTable(intervals) {
    const table = element("table");
    const caption = element("caption","Four intervals in time order. Age is the lag from the sample to its scheduled tap. The turn cosine ranges from −1 for a reversal to +1 for straight ahead.");
    table.append(caption);
    const head = table.createTHead().insertRow();
    for (const name of ["Step","Length (cm)","Time (s)","Age (s)","Two-step (cm)","Turn cosine"]) {
      const th = element("th",name); th.scope = "col"; head.append(th);
    }
    const body = table.createTBody();
    intervals.forEach((row, i) => {
      const tr = body.insertRow();
      const th = element("th",String(i+1)); th.scope = "row"; tr.append(th);
      row.forEach((v, k) => { tr.insertCell().textContent = format(v, [2,3,3,2,3][k]); });
    });
    byId("features").replaceChildren(table);
  }

  function clearResults(message) {
    revision++;
    byId("angular-results").hidden = true;
    byId("angle-values").tBodies[0].replaceChildren();
    byId("correction-values").tBodies[0].replaceChildren();
    byId("angle-timing").textContent = byId("angle-interpretation").textContent = "";
    byId("results").hidden = true;
    byId("joint").textContent = byId("recent").textContent = byId("ridge").textContent = "—";
    for (const id of ["joint","recent","ridge"]) delete byId(id).dataset.cm;
    byId("bars").replaceChildren();
    byId("features").replaceChildren();
    byId("measured").textContent = "";
    byId("outcome").open = false;
    byId("outcome").hidden = true;
    byId("status").textContent = message;
  }

  async function showForecast(domain, intervals, recorded, token) {
    const result = await SharedMotion.forecastMovement({domain, intervals});
    if (token !== revision) return;
    if (result.unit !== "cm" || result.domain !== domain) throw new Error("The distance model returned incompatible units.");
    const cm = result.distanceCm;
    const recent = SharedMotion.recentDistance(intervals);
    const ridge = ridgeDistance(domain, intervals, recent);
    for (const [key,value] of Object.entries({joint:cm, recent, ridge})) byId(key).dataset.cm = String(value);
    byId("joint").textContent = format(cm);
    byId("recent").textContent = format(recent) + " cm";
    byId("ridge").textContent = format(ridge) + " cm";
    byId("forecast-caption").textContent = domain === "rat"
      ? "2D tracked position on the maze. Nominal endpoint 0.25 s after cutoff."
      : "3D right-wrist position. Nominal endpoint 0.25 s after cutoff.";
    plot(intervals,cm);
    featureTable(intervals);
    byId("outcome").hidden = !recorded;
    if (recorded) {
      const rat = data.examples.rat;
      byId("measured").textContent = "The camera measured " + format(rat.measuredCm,3) +
        " cm between endpoints " + format(rat.leadS,4) + " s apart. The shared forecast missed by " +
        format(Math.abs(rat.measuredCm-cm),3) + " cm. This example helped train the model.";
    }
    byId("status").textContent = "";
    byId("results").hidden = false;
  }

  const ratHeader = ["time_s","x_cm","y_cm"];
  const wristHeader = ["time_s","grid_s","x_cm","y_cm","z_cm","active","valid","tracked"];
  const currentDomain = () => picker.value;
  const isCustom = () => source.value === "custom";

  async function compareAngles(record, token) {
    if (record?.domain !== "wrist_angle") throw new Error("Choose wrist_angle for angles in degrees.");
    const highest = angleModes.findIndex(entry => entry.id === record.mode);
    if (highest < 0) throw new Error("Choose motion, emg or full for the available measurements.");
    // Validate the source as supplied, including its exact width, clocks and allowed keys.
    // Only then form comparisons from that same admitted history.
    const complete = await SharedMotion.forecastMovement(record);
    if (token !== revision) return;
    const {forearmResidual, forearm_residual, ...window} = record;
    const requestedCorrection = forearmResidual ?? forearm_residual ?? null;
    const available = angleModes.slice(0, highest + 1);
    const direct = available.map(mode => ({mode, correction:null, table:"angle-values"}));
    const adjusted = available.filter(mode => mode.id !== "full")
      .map(mode => ({mode, correction:mode.id, table:"correction-values"}));
    const results = await Promise.all([...direct, ...adjusted].map(async forecast => {
      const {mode, correction} = forecast;
      const result = mode.id === record.mode && correction === requestedCorrection ? complete
        : await SharedMotion.forecastMovement({
          ...window, mode:mode.id, bins:record.bins.map(row => row.slice(0,mode.width)), forearmResidual:correction
        });
      if (result.unit !== "deg" || result.domain !== "wrist_angle" || result.targetTick !== complete.targetTick) {
        throw new Error("The angle model returned incompatible units or timing.");
      }
      return {...forecast, result};
    }));
    if (token !== revision) return;
    for (const {mode, table, result} of results) {
      const tr = byId(table).tBodies[0].insertRow(); tr.dataset.mode = mode.id;
      const th = element("th",mode.label); th.scope = "row"; tr.append(th);
      for (const v of result.angleDeg) {
        const cell = tr.insertCell(); cell.dataset.deg = String(v); cell.textContent = format(v);
      }
    }
    const [x,y] = record.anchorDeg;
    byId("angle-timing").textContent = "At tick " + record.cutoffTick + " the wrist was at " + format(x) + "° extension and " + format(y) +
      "° radial deviation. Each forecast uses the same 16 bins and cue slot to estimate both angles at tick " +
      complete.targetTick + ", a quarter second later (128 ticks at 512 Hz).";
    const outsideRange = results.some(({result}) => result.angleDeg.some(angle => Math.abs(angle) > 180));
    byId("angle-interpretation").textContent = (outsideRange ? "A forecast here falls outside the −180° to 180° range accepted for measured wrist angles. " : "") +
      (highest === 0 ? "Add the four measured forearm channels to compare the two corrections. " : "") +
      "This input supplies no measured future angle.";
    byId("angular-results").hidden = false;
    byId("status").textContent = isCustom() && !anglePractice ? "Forecasts from your input. Source and clock alignment are unverified." : "Forecasts from invented wrist measurements.";
  }
  let anglePractice = false;

  function parseRows(domain) {
    const wrist = domain === "wrist";
    const header = wrist ? wristHeader : ratHeader;
    const text = byId("rows").value.trim();
    if (!text) throw new Error("Enter rows of past positions or fill in the practice samples.");
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines[0].split(",").map(v => v.trim()).join(",") === header.join(",")) lines.shift();
    if (lines.length < 5) throw new Error("Enter a full second of samples. Five sparse tap positions alone cannot establish continuous tracking.");
    return lines.map((line, i) => {
      const fields = line.split(",").map(v => v.trim());
      if (fields.length !== header.length || fields.some(v => !v)) throw new Error("Check the columns in data row " + (i+1) + ".");
      const values = fields.slice(0, wrist ? 5 : 3).map(Number);
      if (!values.every(Number.isFinite)) throw new Error("Enter finite times and centimetre coordinates in row " + (i+1) + ".");
      if (!wrist) return {timeS: values[0], positionCm: values.slice(1)};
      const flags = fields.slice(5);
      if (flags.some(v => v !== "0" && v !== "1")) throw new Error("Use 1 or 0 for each tracking flag in row " + (i+1) + ".");
      return {timeS:values[0], gridTimeS:values[1], positionCm:values.slice(2),
        active:flags[0]==="1", valid:flags[1]==="1", tracked:flags[2]==="1"};
    });
  }

  async function runCustom() {
    clearResults("");
    const token = revision;
    try {
      if (currentDomain() === "wrist_angle") {
        const raw = byId("angle-input").value.trim();
        if (!raw) throw new Error("Enter your wrist measurements or fill in an invented input.");
        let record;
        try { record = JSON.parse(raw); } catch { throw new Error("Enter one complete JSON input object."); }
        await compareAngles(record,token);
        return;
      }
      const cutoff = byId("cutoff").valueAsNumber;
      if (!Number.isFinite(cutoff)) throw new Error("Enter a finite forecast cutoff in seconds.");
      const domain = currentDomain();
      const intervals = SharedMotion.historyFromGeometry({domain,cutoffS:cutoff,samples:parseRows(domain)});
      await showForecast(domain,intervals,false,token);
      if (token === revision) byId("status").textContent = practice ? "Forecast from invented practice samples." : "Forecast from your inputs. Their source and tracking quality are unverified.";
    } catch (e) { if (token === revision) clearResults(e.message); }
  }

  function selectDomain() {
    source.replaceChildren(new Option("Invented example","invented"));
    if (currentDomain() === "wrist_angle") source.add(new Option("Invented forearm example","forearm"));
    if (currentDomain() === "rat") source.add(new Option("Recorded maze trip","recorded"));
    source.add(new Option("Enter my own measurements","custom"));
    selectInput();
  }

  async function selectInput() {
    clearResults("");
    const token = revision;
    const domain = currentDomain();
    const custom = isCustom();
    const angular = domain === "wrist_angle";
    const recorded = source.value === "recorded";
    const forearm = source.value === "forearm";
    byId("custom").hidden = angular || !custom;
    byId("angular-custom").hidden = !angular || !custom;
    byId("angle-study").hidden = !angular;
    byId("distance-study").hidden = angular;
    byId("source-line").textContent = custom
      ? "Enter a history from one trial or recording that you have permission to use. The source clock and units must match this task."
      : recorded
        ? "Recorded camera positions from rat JS14. This is the first eligible training window, two seconds into W-track trip 55."
        : forearm ? "An invented half-second from the forearm correction example. It contains wrist angles and four forearm channels. No person supplied these measurements."
        : angular ? "Invented wrist angles, forearm muscle activity and scalp voltages. All five forecasts use the same half-second."
          : domain === "rat" ? "Invented positions on a two-dimensional maze. There is no measured future endpoint."
            : "Invented right-wrist movement in three dimensions. There is no measured future endpoint.";
    if (!custom) {
      try {
        if (angular) await compareAngles(forearm ? data.forearmExample : data.angleExample,token);
        else {
          const intervals = domain === "rat" && !recorded ? data.inventedRat : data.examples[domain].intervals;
          await showForecast(domain,intervals,recorded,token);
        }
      } catch (e) { if (token === revision) clearResults(e.message); }
      return;
    }
    if (angular) {
      clearResults("Enter the earlier measurements to compare the available models.");
      return;
    }
    const saved = drafts.get(domain);
    byId("cutoff").value = saved?.cutoff ?? "1";
    byId("rows").value = saved?.rows ?? "";
    practice = saved?.practice ?? false;
    const wrist = domain === "wrist";
    const columns = (wrist ? wristHeader : ratHeader).join(", ");
    byId("rows").placeholder = columns;
    byId("schema").textContent = "Enter " + columns + " in that order. " + (wrist
      ? "Use native wrist time and video-frame time in seconds. All positions are in centimetres. Each tracking flag is 1 or 0."
      : "Use camera time in seconds and coordinates in centimetres.");
    clearResults("Run the forecast when the cutoff and samples are ready.");
  }

  function remember() {
    drafts.set(currentDomain(),{rows:byId("rows").value, cutoff:byId("cutoff").value, practice});
  }

  function fillPractice() {
    const wrist = currentDomain() === "wrist";
    const lines = [(wrist ? wristHeader : ratHeader).join(",")];
    for (let i=0; i<=20; i++) {
      const t = i/20;
      const pos = [4*t, 2*t*t].map(v => v.toFixed(5));
      const row = wrist ? [t,t,...pos,(.75*t).toFixed(5),1,1,1] : [t,...pos];
      lines.push(row.join(","));
    }
    byId("rows").value = lines.join("\n"); byId("cutoff").value = "1";
    practice = true;
    remember();
    clearResults("These practice positions are invented. Run a forecast or replace them with your samples.");
  }

  picker.addEventListener("change",selectDomain);
  source.addEventListener("change",selectInput);
  byId("angle-run").addEventListener("click",runCustom);
  byId("angle-input").addEventListener("input", () => {
    anglePractice = false;
    clearResults("Inputs changed. Run the comparison to use these values.");
  });
  byId("angle-fill").addEventListener("click", () => {
    byId("angle-input").value = JSON.stringify(data.angleExample,null,2);
    anglePractice = true;
    clearResults("These wrist measurements are invented. Run the comparison or replace them with your own.");
  });
  byId("run").addEventListener("click",runCustom);
  byId("practice").addEventListener("click",fillPractice);
  for (const id of ["cutoff","rows"]) {
    byId(id).addEventListener("input", () => {
      practice = false;
      remember();
      clearResults("Inputs changed. Run the forecast to use these values.");
    });
  }
  byId("retry").addEventListener("click", () => window.location.reload());
  async function start() {
    try {
      const encoded = new TextEncoder().encode(byId("data").textContent);
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",encoded)), v => v.toString(16).padStart(2,"0")).join("");
      if (hash !== "58ccd72b91444f45a8f7e0bb2bc44621c6c0d0db3fcb0fe53452b42d06b2fd76") throw new Error("The examples and study comparisons failed their SHA-256 check.");
      data = JSON.parse(byId("data").textContent);
      model = await SharedMotion.loadSharedMotion();
      if (model.checkpointSha256 !== "9a3649cb8f2119984e7f9f0b96a07bdc95e1833c7068f0e9caef2680f22e3179") {
        throw new Error("The checkpoint differs from the one used for these comparisons.");
      }
      if (model.movementCheckpointSha256 !== "da243393b7a6f72558365a30f7361e45ef7af680538a7fb5a927e930d91b3458") {
        throw new Error("The wrist-angle checkpoint differs from the studied model.");
      }
      studyTable();
      picker.disabled = source.disabled = false;
      selectDomain();
    } catch(e) {
      clearResults("The model could not load. " + e.message + " Reopen a complete saved copy or retry.");
      byId("retry").hidden = false;
    }
  }
  start();
}, {once:true});

document.currentScript.dataset.started = "true";
