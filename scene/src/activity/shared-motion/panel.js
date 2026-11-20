document.addEventListener("DOMContentLoaded", () => {
  "use strict";
  // Capture the unmodified public page before running examples or accepting reader input.
  const save = document.querySelector(".save");
  if (!document.querySelector("script[src]")) {
    const original = "<!doctype html>\n" + document.documentElement.outerHTML;
    save.href = URL.createObjectURL(new Blob([original], {type:"text/html;charset=utf-8"}));
  }
  const data = JSON.parse(document.getElementById("data").textContent);
  const byId = id => document.getElementById(id);
  const picker = byId("history-select");
  const drafts = new Map();
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

  function showForecast(domain, intervals, recorded) {
    const cm = model.forecast(domain, intervals);
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
  const currentDomain = () => picker.value.endsWith("wrist") ? "wrist" : "rat";
  const isCustom = () => picker.value.startsWith("custom-");

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

  function runCustom() {
    clearResults("");
    try {
      const cutoff = byId("cutoff").valueAsNumber;
      if (!Number.isFinite(cutoff)) throw new Error("Enter a finite forecast cutoff in seconds.");
      const domain = currentDomain();
      const intervals = SharedMotion.historyFromGeometry({domain,cutoffS:cutoff,samples:parseRows(domain)});
      showForecast(domain,intervals,false);
      byId("status").textContent = practice ? "Forecast from invented practice samples." : "Forecast from your inputs. Their source and tracking quality are unverified.";
    } catch (e) { clearResults(e.message); }
  }

  function selectInput() {
    clearResults("");
    const domain = currentDomain();
    const custom = isCustom();
    byId("custom").hidden = !custom;
    byId("source-line").textContent = custom
      ? "Your samples stay in this tab. Enter source times and positions from one past recording. You can try the input format with invented practice values."
      : domain === "rat"
        ? "Recorded camera positions from rat JS14. This is the first eligible training window, two seconds into W-track trip 55."
        : "Invented right-wrist movement in three dimensions. There is no measured future endpoint for this example.";
    if (!custom) {
      try { showForecast(domain, data.examples[domain].intervals, domain === "rat"); }
      catch (e) { clearResults(e.message); }
      return;
    }
    const saved = drafts.get(domain);
    byId("cutoff").value = saved?.cutoff ?? "1";
    byId("rows").value = saved?.rows ?? "";
    practice = saved?.practice ?? false;
    const wrist = domain === "wrist";
    const columns = (wrist ? wristHeader : ratHeader).join(", ");
    byId("rows").placeholder = columns;
    byId("schema").textContent = "Enter " + columns + " in that order" + ". " + (wrist
      ? "Use native wrist time and video-frame time in seconds. Each of the three wrist tracking flags is 1 or 0."
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

  picker.addEventListener("change",selectInput);
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
  studyTable();
  async function start() {
    try {
      model = await SharedMotion.loadSharedMotion();
      if (model.checkpointSha256 !== "9a3649cb8f2119984e7f9f0b96a07bdc95e1833c7068f0e9caef2680f22e3179") {
        throw new Error("The checkpoint differs from the one used for these comparisons.");
      }
      picker.disabled = false;
      selectInput();
    } catch(e) {
      clearResults("The model could not load. " + e.message + " Reopen a complete saved copy or retry.");
      byId("retry").hidden = false;
    }
  }
  start();
}, {once:true});
