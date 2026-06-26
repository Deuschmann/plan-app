const STORAGE_KEY = "local-plan-app-state-v1";
const DEFAULT_USER_ID = "local-user";

const statuses = {
  schedule: [
    ["planned", "计划中"],
    ["done", "完成"],
    ["delayed", "延后"],
    ["skipped", "没做"],
    ["swapped", "换成别的"]
  ],
  task: [
    ["todo", "待做"],
    ["done", "完成"],
    ["blocked", "卡住"],
    ["missed", "未完成"],
    ["moved", "转明天"]
  ]
};

const chartColors = ["#26b99a", "#d59b39", "#dc6c5f", "#8c9298", "#52c7b8", "#c28738", "#b87468", "#6f7b83"];

const initialTodayKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const defaults = {
  userId: DEFAULT_USER_ID,
  registeredAt: initialTodayKey(),
  body: {
    sex: "male",
    age: 25,
    height: 175,
    weight: 70,
    fitnessGoal: "cut",
    activity: 1.375,
    wakeTime: "07:30",
    sleepTime: "23:30"
  },
  goals: {
    weekly: "",
    monthly: "",
    yearly: "",
    items: []
  },
  templates: {
    schedules: []
  },
  foodLibrary: [],
  days: {}
};

const $ = (selector) => document.querySelector(selector);
const todayKey = () => toDateKey(new Date());
const pageTitles = {
  plan: "计划",
  tasks: "任务",
  food: "饮食",
  feedback: "反馈",
  user: "用户"
};
const SYSTEM_NOTE_PATTERNS = [
  /正在做，已取消提示/g
];

let state = loadState();
let selectedDay = todayKey();
let activePage = "plan";
let activePlanTab = "daily";
let editing = null;
let activePicker = null;
let undoAction = null;

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key) {
  return new Date(`${key}T12:00:00`);
}

function shiftDate(key, days) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function relativeDateLabel(key) {
  const diff = Math.round((dateFromKey(key) - dateFromKey(todayKey())) / 86400000);
  if (diff === 0) return "今天";
  if (diff === -1) return "昨天";
  if (diff === 1) return "明天";
  if (diff < 0) return `${Math.abs(diff)} 天前`;
  return `${diff} 天后`;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(defaults);
  try {
    return mergeDefaults(JSON.parse(raw));
  } catch {
    return structuredClone(defaults);
  }
}

function mergeDefaults(value) {
  return {
    ...structuredClone(defaults),
    ...value,
    registeredAt: value.registeredAt || todayKey(),
    body: { ...defaults.body, ...(value.body || {}) },
    goals: normalizeGoals({ ...defaults.goals, ...(value.goals || {}) }),
    templates: normalizeTemplates({ ...defaults.templates, ...(value.templates || {}) }),
    foodLibrary: Array.isArray(value.foodLibrary) ? value.foodLibrary : [],
    days: value.days || {}
  };
}

function normalizeTemplates(templates) {
  return {
    schedules: Array.isArray(templates.schedules) ? templates.schedules.map((template) => ({
      id: template.id || uid("template"),
      userId: template.userId || DEFAULT_USER_ID,
      name: String(template.name || "时间表模板").trim(),
      items: Array.isArray(template.items) ? template.items.map((item) => ({
        time: item.time || "08:00",
        title: String(item.title || "").trim(),
        durationMinutes: Number(item.durationMinutes || 30),
        note: String(item.note || "")
      })).filter((item) => item.title) : [],
      createdAt: template.createdAt || new Date().toISOString()
    })) : []
  };
}

function normalizeGoals(goals) {
  const items = Array.isArray(goals.items) ? [...goals.items] : [];
  for (const scope of ["weekly", "monthly", "yearly"]) {
    if (goals[scope] && !items.some((item) => item.scope === scope && item.title === goals[scope])) {
      items.push(createGoalItem(scope, goals[scope]));
    }
    goals[scope] = "";
  }
  return { ...goals, items };
}

function createGoalItem(scope, title) {
  return {
    id: uid("goal"),
    userId: state?.userId || DEFAULT_USER_ID,
    scope,
    title: String(title || "").trim(),
    done: false,
    createdAt: new Date().toISOString()
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function currentDay() {
  if (isBeforeRegistration()) {
    return {
      userId: state.userId,
      date: selectedDay,
      schedule: [],
      wakeTime: state.body.wakeTime || "07:30",
      sleepTime: state.body.sleepTime || "23:30",
      tasks: [],
      foods: []
    };
  }
  if (!state.days[selectedDay]) {
    state.days[selectedDay] = {
      userId: state.userId,
      date: selectedDay,
      schedule: [],
      wakeTime: state.body.wakeTime || "07:30",
      sleepTime: state.body.sleepTime || "23:30",
      tasks: [],
      foods: []
    };
  }
  return state.days[selectedDay];
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createSchedule(time, title, durationMinutes = 30) {
  return {
    id: uid("block"),
    userId: state.userId,
    time,
    title,
    durationMinutes: Number(durationMinutes) || 30,
    status: "planned",
    note: "",
    startedAt: "",
    completedAt: "",
    actualMinutes: 0,
    history: [],
    createdAt: new Date().toISOString()
  };
}

function createTask(title, durationMinutes = 30) {
  return {
    id: uid("task"),
    userId: state.userId,
    title,
    durationMinutes: Number(durationMinutes) || 30,
    status: "todo",
    note: "",
    startedAt: "",
    completedAt: "",
    actualMinutes: 0,
    history: [],
    createdAt: new Date().toISOString()
  };
}

function createFood(data) {
  return {
    id: uid("food"),
    userId: state.userId,
    ...data,
    createdAt: new Date().toISOString()
  };
}

function nutritionTargets() {
  const body = state.body;
  const heightMeters = Number(body.height) / 100;
  const bmi = Number(body.weight) / (heightMeters * heightMeters);
  const sexOffset = body.sex === "male" ? 5 : -161;
  const bmr = 10 * Number(body.weight) + 6.25 * Number(body.height) - 5 * Number(body.age) + sexOffset;
  const tdee = bmr * Number(body.activity);
  const calorieAdjust = {
    cut: -350,
    maintain: 0,
    bulk: 250,
    performance: 100
  }[body.fitnessGoal];
  const calories = Math.max(1200, Math.round(tdee + calorieAdjust));
  const protein = Math.round(Number(body.weight) * (body.fitnessGoal === "bulk" ? 1.8 : 1.6));
  const fat = Math.round(Number(body.weight) * 0.8);
  const carbs = Math.max(80, Math.round((calories - protein * 4 - fat * 9) / 4));
  return {
    bmi,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calories,
    protein,
    fat,
    carbs
  };
}

function foodTotals() {
  return currentDay().foods.reduce(
    (acc, food) => {
      acc.calories += Number(food.calories || 0);
      acc.protein += Number(food.protein || 0);
      acc.fat += Number(food.fat || 0);
      acc.carbs += Number(food.carbs || 0);
      return acc;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );
}

function percent(value, target) {
  return Math.min(100, Math.round((Number(value || 0) / Math.max(1, Number(target))) * 100));
}

function render() {
  if (!isBeforeRegistration()) normalizeCurrentDay();
  const date = dateFromKey(selectedDay);
  $("#todayLabel").textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
  $("#selectedDateTitle").textContent = activePage === "plan" ? relativeDateLabel(selectedDay) : pageTitles[activePage];
  $("#datePicker").value = selectedDay;

  renderCalendar();
  renderFocusCard();
  renderTimeOverview();
  renderSchedule();
  renderTemplates();
  renderTasks();
  renderGoals();
  renderBody();
  renderFoods();
  renderFoodLibrary();
  renderFeedback();
  renderActivePage();
  renderPlanTab();
  renderRegistrationState();
  renderUndoToast();
  saveState();
}

function isBeforeRegistration() {
  return selectedDay < state.registeredAt;
}

function renderRegistrationState() {
  const before = isBeforeRegistration();
  document.querySelector(".content")?.classList.toggle("before-registration", before);
  $("#preRegisterState").hidden = !before;
  document.querySelectorAll(".plan-pane").forEach((pane) => {
    pane.hidden = before;
  });
  document.querySelectorAll("#blockForm input, #blockForm button, #taskForm input, #taskForm button, #foodForm input, #foodForm button, #resetDemoBtn").forEach((element) => {
    element.disabled = before;
  });
}

function renderFocusCard() {
  const day = currentDay();
  const schedule = [...day.schedule].sort((a, b) => a.time.localeCompare(b.time));
  const tasks = day.tasks || [];
  const doneTasks = tasks.filter((task) => task.status === "done").length;
  const taskText = tasks.length ? `${doneTasks}/${tasks.length} 个任务完成` : "还没有任务";
  const isToday = selectedDay === todayKey();
  const current = isToday ? currentScheduleItem(schedule) : null;
  const next = current ? nextScheduleItem(schedule, current.id) : schedule[0];

  if (!current) {
    $("#focusCard").hidden = true;
    $("#focusCard").innerHTML = "";
    return;
  }

  $("#focusCard").hidden = false;
  $("#focusCard").innerHTML = `
    <div class="focus-main">
      <p class="eyebrow">${isToday ? "Now" : "Selected Day"}</p>
      <h2>${escapeHTML(current.title)}</h2>
      <p class="focus-note">${escapeHTML(current.time)} · ${formatDuration(current.durationMinutes)} · ${statusLabel("schedule", current.status)}</p>
      ${current.note ? `<p class="focus-note">${escapeHTML(current.note)}</p>` : ""}
      ${isToday ? `
        <div class="focus-actions">
          <button data-focus-done="${current.id}" type="button">做完了</button>
          <button class="secondary" data-focus-quiet="${current.id}" type="button">正在做，不再提示</button>
        </div>
      ` : ""}
    </div>
    <aside class="focus-aside">
      <span>下一个</span>
      <strong>${next ? `${escapeHTML(next.time)} ${escapeHTML(next.title)}` : "没有更多安排"}</strong>
      <span>${taskText}</span>
    </aside>
  `;
}

function currentScheduleItem(schedule) {
  if (!schedule.length) return null;
  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  for (const item of schedule) {
    if (item.status === "done" || item.quiet) continue;
    const start = timeToMinutes(item.time);
    const end = start + Number(item.durationMinutes || 30);
    if (minutesNow >= start && minutesNow < end) return item;
  }
  return null;
}

function nextScheduleItem(schedule, currentId) {
  const index = schedule.findIndex((item) => item.id === currentId);
  if (index < 0) return null;
  return schedule[index + 1] || null;
}

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function renderActivePage() {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.dataset.page === activePage);
  });
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.nav === activePage);
  });
}

function renderPlanTab() {
  document.querySelectorAll("[data-plan-pane]").forEach((pane) => {
    pane.classList.toggle("active", pane.dataset.planPane === activePlanTab);
  });
  document.querySelectorAll("[data-plan-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.planTab === activePlanTab);
  });
  document.querySelector(".plan-switch")?.style.setProperty("--active-index", activePlanTab === "daily" ? 0 : 1);
}

function animateDateChange() {
  document.querySelector(".date-dock")?.classList.remove("date-pulse");
  document.querySelector(".today-panel")?.classList.remove("date-pulse");
  requestAnimationFrame(() => {
    document.querySelector(".date-dock")?.classList.add("date-pulse");
    document.querySelector(".today-panel")?.classList.add("date-pulse");
  });
}

function normalizeCurrentDay() {
  const day = currentDay();
  day.schedule = (day.schedule || []).map((item) => ({
    ...item,
    durationMinutes: Number(item.durationMinutes || 30),
    note: cleanSystemNote(item.note),
    startedAt: item.startedAt || "",
    completedAt: item.completedAt || "",
    actualMinutes: Number(item.actualMinutes || 0),
    history: Array.isArray(item.history) ? item.history : []
  }));
  const wakeBlock = day.schedule.find((item) => /起床|醒|wake/i.test(item.title));
  const sleepBlock = day.schedule.find((item) => /睡|sleep/i.test(item.title));
  if (wakeBlock?.time) day.wakeTime = day.wakeTime || wakeBlock.time;
  if (sleepBlock?.time) day.sleepTime = day.sleepTime || sleepBlock.time;
  day.wakeTime = day.wakeTime || state.body.wakeTime || "07:30";
  day.sleepTime = day.sleepTime || state.body.sleepTime || "23:30";
  day.schedule = day.schedule.filter((item) => !/睡|sleep|起床|醒|wake/i.test(item.title));
  day.schedule = day.schedule.filter((item) => !isGeneratedDefaultBlock(item));
  day.tasks = (day.tasks || []).map((item) => ({
    ...item,
    durationMinutes: Number(item.durationMinutes || 30),
    note: cleanSystemNote(item.note),
    startedAt: item.startedAt || "",
    completedAt: item.completedAt || "",
    actualMinutes: Number(item.actualMinutes || 0),
    history: Array.isArray(item.history) ? item.history : []
  }));
  day.foods = (day.foods || []).map((food) => ({
    ...food,
    time: food.time || "08:00",
    name: String(food.name || "").trim(),
    calories: Number(food.calories || 0),
    protein: Number(food.protein || 0),
    fat: Number(food.fat || 0),
    carbs: Number(food.carbs || 0)
  })).filter((food) => food.name);
}

function isGeneratedDefaultBlock(item) {
  const defaults = [
    { title: "早餐", time: "08:00", durationMinutes: 30 },
    { title: "锻炼", time: "18:30", durationMinutes: 60 }
  ];
  return defaults.some((entry) =>
    item.title === entry.title &&
    item.time === entry.time &&
    Number(item.durationMinutes || 0) === entry.durationMinutes &&
    item.status === "planned" &&
    !item.note
  );
}

function cleanSystemNote(note) {
  let value = String(note || "");
  for (const pattern of SYSTEM_NOTE_PATTERNS) {
    value = value.replace(pattern, "");
  }
  return value.replace(/\n{3,}/g, "\n\n").trim();
}

function renderCalendar() {
  const center = dateFromKey(selectedDay);
  const start = new Date(center);
  start.setDate(center.getDate() - 3);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  const formatter = new Intl.DateTimeFormat("zh-CN", { weekday: "short" });
  $("#weekStrip").innerHTML = days.map((date) => {
    const key = toDateKey(date);
    const day = state.days[key];
    const beforeRegistration = key < state.registeredAt;
    const hasPlan = !beforeRegistration && Boolean(day && (day.schedule?.length || day.tasks?.length || day.foods?.length));
    return `
      <button class="day-pill ${key === selectedDay ? "active" : ""} ${key === todayKey() ? "is-today" : ""} ${beforeRegistration ? "before-start" : ""}" data-select-day="${key}" type="button">
        <span>${formatter.format(date)}</span>
        <strong>${date.getDate()}</strong>
        <i aria-hidden="true">${hasPlan ? "•" : ""}</i>
      </button>
    `;
  }).join("");
}

function renderSchedule() {
  const timeline = $("#timeline");
  const day = currentDay();
  day.schedule.sort((a, b) => a.time.localeCompare(b.time));
  timeline.innerHTML = day.schedule.map((item) => `
    <article class="timeline-item">
      <div class="time">${escapeHTML(item.time)}</div>
      <div>
        ${editing?.type === "schedule" && editing.id === item.id ? editScheduleForm(item) : `
        <div class="item-head">
          <div>
            <div class="item-title">${escapeHTML(item.title)}</div>
          <p class="meta">${statusLabel("schedule", item.status)} · ${formatDuration(item.durationMinutes)}${item.note ? ` · ${escapeHTML(item.note)}` : ""}</p>
            ${executionSummary(item)}
          </div>
          <div class="card-actions">
            <button class="mini-btn" data-edit-schedule="${item.id}" type="button">编辑</button>
            <button class="delete-btn" data-delete-schedule="${item.id}" type="button" aria-label="删除">×</button>
          </div>
        </div>
        ${executionControls("schedule", item)}
        ${statusButtons("schedule", item)}
        <textarea class="note-input" data-note-schedule="${item.id}" rows="3" placeholder="记录延后、替换或没做的原因">${escapeHTML(item.note)}</textarea>
        ${historyList(item)}
        `}
      </div>
    </article>
  `).join("");
}

function renderTemplates() {
  const templates = state.templates?.schedules || [];
  const list = $("#templateList");
  if (!list) return;
  list.innerHTML = templates.length ? templates.map((template) => `
    <article class="template-item">
      <div>
        <strong>${escapeHTML(template.name)}</strong>
        <span>${template.items.length} 个时间块</span>
      </div>
      <div class="card-actions">
        <button class="mini-btn" data-apply-template="${template.id}" type="button">应用</button>
        <button class="mini-btn" data-replace-template="${template.id}" type="button">覆盖</button>
        <button class="delete-btn" data-delete-template="${template.id}" type="button" aria-label="删除">×</button>
      </div>
    </article>
  `).join("") : `<p class="meta">还没有模板。排好一天后，可以保存成模板给以后使用。</p>`;
}

function renderTasks() {
  const list = $("#taskList");
  const tasks = currentDay().tasks;
  list.innerHTML = tasks.length ? tasks.map((task) => `
    <article class="card">
      ${editing?.type === "task" && editing.id === task.id ? editTaskForm(task) : `
      <div class="item-head">
        <div>
          <div class="item-title">${escapeHTML(task.title)}</div>
          <p class="meta">${statusLabel("task", task.status)} · ${formatDuration(task.durationMinutes)}${task.note ? ` · ${escapeHTML(task.note)}` : ""}</p>
          ${executionSummary(task)}
        </div>
        <div class="card-actions">
          <button class="mini-btn" data-edit-task="${task.id}" type="button">编辑</button>
          <button class="delete-btn" data-delete-task="${task.id}" type="button" aria-label="删除">×</button>
        </div>
      </div>
      ${executionControls("task", task)}
      ${statusButtons("task", task)}
      <textarea class="note-input" data-note-task="${task.id}" rows="3" placeholder="记录问题、卡点或变更">${escapeHTML(task.note)}</textarea>
      ${historyList(task)}
      `}
    </article>
  `).join("") : `<p class="meta">还没有任务。添加今天真正要完成的事。</p>`;
}

function editScheduleForm(item) {
  return `
    <form class="edit-form" data-edit-form="schedule" data-edit-id="${item.id}">
      <input name="time" type="text" inputmode="none" data-edit-wheel="time" value="${escapeAttr(item.time)}" required />
      <input name="title" type="text" value="${escapeAttr(item.title)}" required />
      <input name="durationMinutes" type="text" inputmode="none" data-edit-wheel="duration" value="${escapeAttr(item.durationMinutes)}" required />
      <textarea name="note" rows="4" placeholder="备注">${escapeHTML(item.note)}</textarea>
      <div class="edit-actions">
        <button type="submit">保存</button>
        <button class="secondary" data-cancel-edit type="button">取消</button>
      </div>
    </form>
  `;
}

function editTaskForm(item) {
  return `
    <form class="edit-form" data-edit-form="task" data-edit-id="${item.id}">
      <input name="title" type="text" value="${escapeAttr(item.title)}" required />
      <input name="durationMinutes" type="text" inputmode="none" data-edit-wheel="duration" value="${escapeAttr(item.durationMinutes)}" required />
      <textarea name="note" rows="4" placeholder="备注">${escapeHTML(item.note)}</textarea>
      <div class="edit-actions">
        <button type="submit">保存</button>
        <button class="secondary" data-cancel-edit type="button">取消</button>
      </div>
    </form>
  `;
}

function executionSummary(item) {
  const parts = [];
  if (item.startedAt) parts.push(`开始 ${formatClock(item.startedAt)}`);
  if (item.completedAt) parts.push(`完成 ${formatClock(item.completedAt)}`);
  if (Number(item.actualMinutes || 0) > 0) parts.push(`实际 ${formatDuration(item.actualMinutes)}`);
  return parts.length ? `<p class="meta execution-meta">${parts.map(escapeHTML).join(" · ")}</p>` : "";
}

function executionControls(type, item) {
  return `
    <div class="execution-actions">
      <button class="mini-btn" data-start-${type}="${item.id}" type="button">${item.startedAt ? "重新开始" : "开始记录"}</button>
      ${item.startedAt && !item.completedAt ? `<button class="mini-btn" data-finish-${type}="${item.id}" type="button">完成并计时</button>` : ""}
    </div>
  `;
}

function historyList(item) {
  const items = Array.isArray(item.history) ? item.history.slice(-3).reverse() : [];
  if (!items.length) return "";
  return `
    <div class="history-list">
      ${items.map((entry) => `<span>${escapeHTML(formatClock(entry.at))} · ${escapeHTML(entry.label)}</span>`).join("")}
    </div>
  `;
}

function renderTimeOverview() {
  const day = currentDay();
  const baselineMinutes = day.schedule.reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0) + sleepDurationFromTime(day.sleepTime, day.wakeTime);
  const taskItems = day.tasks
    .map((item) => ({ label: item.title, minutes: Number(item.durationMinutes || 0), type: "task" }))
    .filter((item) => item.minutes > 0);
  const taskMinutes = taskItems.reduce((sum, item) => sum + item.minutes, 0);
  const remaining = Math.max(0, 1440 - baselineMinutes - taskMinutes);
  const chartItems = [
    ...taskItems,
    { label: "基础时间", minutes: baselineMinutes, type: "baseline" },
    { label: "剩余时间", minutes: remaining, type: "rest" }
  ].filter((item) => item.minutes > 0);
  let cursor = 0;
  const gradient = chartItems.map((item, index) => {
    const start = (cursor / 1440) * 100;
    cursor += item.minutes;
    const end = (cursor / 1440) * 100;
    const color = chartColor(item, index);
    return `${color} ${start}% ${end}%`;
  }).join(", ");
  $("#timeDonut").style.background = `conic-gradient(${gradient})`;
  $("#plannedHours").textContent = formatDuration(taskMinutes);
  $("#timeLegend").innerHTML = chartItems
    .filter((item) => item.minutes > 0)
    .map((item, index) => {
      const color = chartColor(item, index);
      const ratio = Math.round((item.minutes / 1440) * 100);
      return `
        <div class="legend-item">
          <span class="legend-dot" style="background:${color}"></span>
          <div>
            <strong>${escapeHTML(item.label)}</strong>
            <p>${formatDuration(item.minutes)} · ${ratio}%</p>
          </div>
        </div>
      `;
    }).join("");
}

function sleepDurationFromTime(sleepTime, wakeTime) {
  const sleepStart = timeToMinutes(sleepTime || "23:30");
  const wakeMinutes = timeToMinutes(wakeTime || "07:30");
  return sleepStart <= wakeMinutes ? wakeMinutes - sleepStart : 1440 - sleepStart + wakeMinutes;
}

function applyRoutineDefaultsFromTomorrow() {
  const tomorrow = shiftDate(todayKey(), 1);
  for (const day of Object.values(state.days)) {
    if (!day?.date || day.date < tomorrow) continue;
    day.wakeTime = state.body.wakeTime || "07:30";
    day.sleepTime = state.body.sleepTime || "23:30";
  }
}

function chartColor(item, index) {
  if (item.type === "baseline") return "#4a5156";
  if (item.type === "rest") return "#2b2f32";
  return chartColors[index % chartColors.length];
}

function renderGoals() {
  state.goals = normalizeGoals(state.goals);
  const labels = { weekly: "本周", monthly: "本月", yearly: "今年" };
  $("#goalLists").innerHTML = ["weekly", "monthly", "yearly"].map((scope) => {
    const items = state.goals.items.filter((item) => item.scope === scope);
    return `
      <section class="goal-list">
        <h3>${labels[scope]}</h3>
        ${items.length ? items.map((item) => `
          <article class="goal-item">
            <button class="status-chip ${item.done ? "active" : ""}" data-toggle-goal="${item.id}" type="button">${item.done ? "完成" : "进行中"}</button>
            <p>${escapeHTML(item.title)}</p>
            <button class="delete-btn" data-delete-goal="${item.id}" type="button" aria-label="删除">×</button>
          </article>
        `).join("") : `<p class="meta">还没有目标。</p>`}
      </section>
    `;
  }).join("");
}

function renderBody() {
  for (const key of ["sex", "age", "height", "weight", "fitnessGoal", "activity", "wakeTime", "sleepTime"]) {
    $(`#${key}`).value = state.body[key];
  }
  const target = nutritionTargets();
  $("#metrics").innerHTML = [
    metric("BMI", target.bmi.toFixed(1), bmiText(target.bmi)),
    metric("基础代谢", `${target.bmr} kcal`, "估算 BMR"),
    metric("目标热量", `${target.calories} kcal`, "今日建议"),
    metric("三大营养", `P ${target.protein}g · F ${target.fat}g · C ${target.carbs}g`, "蛋白/脂肪/碳水")
  ].join("");
}

function renderFoods() {
  const target = nutritionTargets();
  const totals = foodTotals();
  $("#nutritionSummary").innerHTML = [
    summaryMetric("热量", totals.calories, target.calories, "kcal"),
    summaryMetric("蛋白", totals.protein, target.protein, "g"),
    summaryMetric("脂肪", totals.fat, target.fat, "g"),
    summaryMetric("碳水", totals.carbs, target.carbs, "g")
  ].join("");

  const foods = currentDay().foods.sort((a, b) => a.time.localeCompare(b.time));
  $("#foodList").innerHTML = foods.length ? foods.map((food) => `
    <article class="card">
      ${editing?.type === "food" && editing.id === food.id ? editFoodForm(food) : `
      <div class="item-head">
        <div>
          <div class="item-title">${escapeHTML(food.time)} · ${escapeHTML(food.name)}</div>
          <p class="meta">${Number(food.calories || 0)} kcal · 蛋白 ${Number(food.protein || 0)}g · 脂肪 ${Number(food.fat || 0)}g · 碳水 ${Number(food.carbs || 0)}g</p>
        </div>
        <div class="card-actions">
          <button class="mini-btn" data-save-food-library="${food.id}" type="button">存常用</button>
          <button class="mini-btn" data-edit-food="${food.id}" type="button">编辑</button>
          <button class="delete-btn" data-delete-food="${food.id}" type="button" aria-label="删除">×</button>
        </div>
      </div>
      `}
    </article>
  `).join("") : `<p class="meta">还没有饮食记录。第一版先手动输入，后续可以接食物识别。</p>`;
}

function renderFoodLibrary() {
  const library = state.foodLibrary || [];
  const target = $("#foodLibrary");
  if (!target) return;
  target.innerHTML = library.length ? `
    <div class="library-head">
      <span>常吃食物</span>
      <small>点击使用会填入当前表单</small>
    </div>
    <div class="library-scroll">
      ${library.map((food) => `
        <article class="library-chip">
          <button data-use-food-library="${food.id}" type="button">
            <strong>${escapeHTML(food.name)}</strong>
            <span>${Number(food.calories || 0)} kcal · P ${Number(food.protein || 0)}g</span>
          </button>
          <button class="delete-btn" data-delete-food-library="${food.id}" type="button" aria-label="删除常吃食物">×</button>
        </article>
      `).join("")}
    </div>
  ` : "";
}

function editFoodForm(food) {
  return `
    <form class="edit-form food-edit-form" data-edit-form="food" data-edit-id="${food.id}">
      <input name="time" type="text" inputmode="none" data-edit-wheel="time" value="${escapeAttr(food.time)}" required />
      <input name="name" type="text" value="${escapeAttr(food.name)}" required />
      <input name="calories" type="number" min="0" value="${escapeAttr(food.calories)}" placeholder="kcal" />
      <input name="protein" type="number" min="0" step="0.1" value="${escapeAttr(food.protein)}" placeholder="蛋白 g" />
      <input name="fat" type="number" min="0" step="0.1" value="${escapeAttr(food.fat)}" placeholder="脂肪 g" />
      <input name="carbs" type="number" min="0" step="0.1" value="${escapeAttr(food.carbs)}" placeholder="碳水 g" />
      <div class="edit-actions">
        <button type="submit">保存</button>
        <button class="secondary" data-cancel-edit type="button">取消</button>
      </div>
    </form>
  `;
}

function renderFeedback() {
  $("#feedback").innerHTML = `
    <article class="coming-soon">
      <p class="eyebrow">Review</p>
      <h2>该功能敬请期待</h2>
      <span>接入 LLM 后，这里会根据计划完成、任务问题和饮食记录生成每日反馈。</span>
    </article>
  `;
  return;

  const day = currentDay();
  const target = nutritionTargets();
  const totals = foodTotals();
  const doneSchedule = day.schedule.filter((item) => item.status === "done").length;
  const doneTasks = day.tasks.filter((item) => item.status === "done").length;
  const completion = day.schedule.length ? Math.round((doneSchedule / day.schedule.length) * 100) : 0;
  const taskCompletion = day.tasks.length ? Math.round((doneTasks / day.tasks.length) * 100) : 0;
  const messages = [];

  if (completion >= 75) {
    messages.push(["ok", "时间表执行不错", `固定日程完成率 ${completion}%。继续保持基础节奏。`]);
  } else {
    messages.push(["warning", "时间表偏离较多", `固定日程完成率 ${completion}%。检查最常延后或替换的时间段。`]);
  }

  if (day.tasks.length === 0) {
    messages.push(["warning", "今天还没有任务清单", "建议列出 1-3 个真正重要的任务，不要只靠时间表。"]);
  } else if (taskCompletion < 60) {
    messages.push(["warning", "任务完成率偏低", `今日任务完成率 ${taskCompletion}%。把卡住原因写下来，明天拆小一点。`]);
  } else {
    messages.push(["ok", "任务推进正常", `今日任务完成率 ${taskCompletion}%。`]);
  }

  if (totals.calories > target.calories * 1.1) {
    messages.push(["danger", "热量可能超标", `已记录 ${Math.round(totals.calories)} kcal，高于目标。连续超标会增加体重上升风险。`]);
  } else if (totals.calories < target.calories * 0.65) {
    messages.push(["warning", "饮食记录或摄入偏少", `当前只记录 ${Math.round(totals.calories)} kcal，确认是否漏记。`]);
  } else {
    messages.push(["ok", "热量接近目标", `已记录 ${Math.round(totals.calories)} / ${target.calories} kcal。`]);
  }

  if (totals.protein < target.protein * 0.75) {
    messages.push(["warning", "蛋白质不足", `已记录 ${Math.round(totals.protein)}g，目标 ${target.protein}g。健身日尤其要注意。`]);
  }

  const workout = day.schedule.find((item) => /练|运动|健身|跑步|力量/.test(item.title));
  if (workout && workout.status !== "done") {
    messages.push(["warning", "锻炼没有完成", "如果今天确实太累，可以改成低强度活动，但要记录原因。"]);
  }

  $("#feedback").innerHTML = messages.map(([type, title, body]) => `
    <article class="feedback-item ${type}">
      <strong>${escapeHTML(title)}</strong>
      <span>${escapeHTML(body)}</span>
    </article>
  `).join("");
}

function metric(title, value, caption) {
  return `<article class="metric-card"><span>${title}</span><strong>${value}</strong><span>${caption}</span></article>`;
}

function summaryMetric(title, value, target, unit) {
  const pct = percent(value, target);
  return `
    <article class="metric-card">
      <span>${title}</span>
      <strong>${Math.round(Number(value || 0))}${unit}</strong>
      <span>目标 ${target}${unit}</span>
      <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
    </article>
  `;
}

function bmiText(value) {
  if (value < 18.5) return "偏低";
  if (value < 24) return "正常区间";
  if (value < 28) return "偏高";
  return "较高";
}

function statusButtons(type, item) {
  return `
    <div class="status-row">
      ${statuses[type].map(([value, label]) => `
        <button class="status-chip ${item.status === value ? "active" : ""}" data-status-type="${type}" data-status-id="${item.id}" data-status-value="${value}" type="button">${label}</button>
      `).join("")}
    </div>
  `;
}

function statusLabel(type, value) {
  return statuses[type].find(([key]) => key === value)?.[1] || value;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function escapeAttr(value) {
  return escapeHTML(value).replace(/`/g, "&#096;");
}

function bindEvents() {
  setupWheelInputs();

  $("#blockForm").addEventListener("submit", (event) => {
    event.preventDefault();
    currentDay().schedule.push(createSchedule($("#blockTime").value, $("#blockTitle").value.trim(), $("#blockDuration").value));
    event.currentTarget.reset();
    render();
  });

  $("#templateForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const day = currentDay();
    if (!day.schedule.length) {
      window.alert("先添加时间表，再保存模板。");
      return;
    }
    const name = $("#templateName").value.trim() || `时间表模板 ${state.templates.schedules.length + 1}`;
    state.templates.schedules.push({
      id: uid("template"),
      userId: state.userId,
      name,
      items: templateItemsFromSchedule(day.schedule),
      createdAt: new Date().toISOString()
    });
    event.currentTarget.reset();
    render();
  });

  $("#addBlockBtn").addEventListener("click", () => {
    $("#blockTime").focus();
  });

  $("#copyYesterdayBtn").addEventListener("click", () => {
    const yesterday = state.days[shiftDate(selectedDay, -1)];
    if (!yesterday?.schedule?.length) {
      window.alert("昨天还没有可复制的时间表。");
      return;
    }
    replaceScheduleWithItems(templateItemsFromSchedule(yesterday.schedule), "已复制昨天的时间表");
  });

  $("#prevDayBtn").addEventListener("click", () => {
    selectedDay = shiftDate(selectedDay, -1);
    animateDateChange();
    render();
  });

  $("#nextDayBtn").addEventListener("click", () => {
    selectedDay = shiftDate(selectedDay, 1);
    animateDateChange();
    render();
  });

  $("#goTodayBtn").addEventListener("click", () => {
    selectedDay = todayKey();
    animateDateChange();
    render();
  });

  $("#datePicker").addEventListener("change", (event) => {
    if (!event.target.value) return;
    selectedDay = event.target.value;
    animateDateChange();
    render();
  });

  $("#taskForm").addEventListener("submit", (event) => {
    event.preventDefault();
    currentDay().tasks.push(createTask($("#taskTitle").value.trim(), $("#taskDuration").value));
    event.currentTarget.reset();
    render();
  });

  $("#goalForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = $("#goalTitle").value.trim();
    if (!title) return;
    state.goals.items.push(createGoalItem($("#goalScope").value, title));
    event.currentTarget.reset();
    render();
  });

  $("#foodForm").addEventListener("submit", (event) => {
    event.preventDefault();
    currentDay().foods.push(createFood({
      time: $("#foodTime").value,
      name: $("#foodName").value.trim(),
      calories: Number($("#foodCalories").value || 0),
      protein: Number($("#foodProtein").value || 0),
      fat: Number($("#foodFat").value || 0),
      carbs: Number($("#foodCarbs").value || 0)
    }));
    event.currentTarget.reset();
    render();
  });

  document.addEventListener("click", (event) => {
    const editWheel = event.target.closest("[data-edit-wheel]");
    if (editWheel) {
      event.preventDefault();
      openPicker(editWheel, editWheel.dataset.editWheel, {});
      return;
    }

    const statusButton = event.target.closest("[data-status-id]");
    if (statusButton) {
      updateStatus(statusButton.dataset.statusType, statusButton.dataset.statusId, statusButton.dataset.statusValue);
      return;
    }

    const navButton = event.target.closest("[data-nav]");
    if (navButton) {
      activePage = navButton.dataset.nav;
      render();
      return;
    }

    const planTab = event.target.closest("[data-plan-tab]");
    if (planTab) {
      activePlanTab = planTab.dataset.planTab;
      render();
      return;
    }

    const goalScope = event.target.closest("[data-goal-scope]");
    if (goalScope) {
      $("#goalScope").value = goalScope.dataset.goalScope;
      document.querySelectorAll("[data-goal-scope]").forEach((button) => {
        button.classList.toggle("active", button === goalScope);
      });
      const index = ["weekly", "monthly", "yearly"].indexOf(goalScope.dataset.goalScope);
      goalScope.closest(".scope-segment")?.style.setProperty("--active-index", Math.max(0, index));
      return;
    }

    const dayButton = event.target.closest("[data-select-day]");
    if (dayButton) {
      selectedDay = dayButton.dataset.selectDay;
      animateDateChange();
      render();
      return;
    }

    const toggleGoal = event.target.closest("[data-toggle-goal]");
    if (toggleGoal) {
      const item = state.goals.items.find((goal) => goal.id === toggleGoal.dataset.toggleGoal);
      if (item) item.done = !item.done;
      render();
      return;
    }

    const deleteGoal = event.target.closest("[data-delete-goal]");
    if (deleteGoal) {
      const index = state.goals.items.findIndex((goal) => goal.id === deleteGoal.dataset.deleteGoal);
      const removed = state.goals.items[index];
      if (removed) {
        state.goals.items.splice(index, 1);
        setUndo(`已删除规划「${removed.title}」`, () => {
          state.goals.items.splice(index, 0, removed);
        });
      }
      render();
      return;
    }

    const applyTemplate = event.target.closest("[data-apply-template]");
    if (applyTemplate) {
      const template = state.templates.schedules.find((item) => item.id === applyTemplate.dataset.applyTemplate);
      if (template) {
        currentDay().schedule.push(...scheduleFromTemplateItems(template.items));
        render();
      }
      return;
    }

    const replaceTemplate = event.target.closest("[data-replace-template]");
    if (replaceTemplate) {
      const template = state.templates.schedules.find((item) => item.id === replaceTemplate.dataset.replaceTemplate);
      if (template) replaceScheduleWithItems(template.items, `已应用模板「${template.name}」`);
      return;
    }

    const deleteTemplate = event.target.closest("[data-delete-template]");
    if (deleteTemplate) {
      const index = state.templates.schedules.findIndex((item) => item.id === deleteTemplate.dataset.deleteTemplate);
      const removed = state.templates.schedules[index];
      if (removed) {
        state.templates.schedules.splice(index, 1);
        setUndo(`已删除模板「${removed.name}」`, () => {
          state.templates.schedules.splice(index, 0, removed);
        });
      }
      render();
      return;
    }

    const focusDone = event.target.closest("[data-focus-done]");
    if (focusDone) {
      const item = currentDay().schedule.find((entry) => entry.id === focusDone.dataset.focusDone);
      if (item) item.status = "done";
      render();
      return;
    }

    const focusQuiet = event.target.closest("[data-focus-quiet]");
    if (focusQuiet) {
      const item = currentDay().schedule.find((entry) => entry.id === focusQuiet.dataset.focusQuiet);
      if (item) {
        item.quiet = true;
        item.note = cleanSystemNote(item.note);
      }
      render();
      return;
    }

    const editSchedule = event.target.closest("[data-edit-schedule]");
    if (editSchedule) {
      editing = { type: "schedule", id: editSchedule.dataset.editSchedule };
      render();
      return;
    }

    const editTask = event.target.closest("[data-edit-task]");
    if (editTask) {
      editing = { type: "task", id: editTask.dataset.editTask };
      render();
      return;
    }

    const editFood = event.target.closest("[data-edit-food]");
    if (editFood) {
      editing = { type: "food", id: editFood.dataset.editFood };
      render();
      return;
    }

    const startSchedule = event.target.closest("[data-start-schedule]");
    if (startSchedule) {
      startExecution("schedule", startSchedule.dataset.startSchedule);
      return;
    }

    const finishSchedule = event.target.closest("[data-finish-schedule]");
    if (finishSchedule) {
      finishExecution("schedule", finishSchedule.dataset.finishSchedule);
      return;
    }

    const startTask = event.target.closest("[data-start-task]");
    if (startTask) {
      startExecution("task", startTask.dataset.startTask);
      return;
    }

    const finishTask = event.target.closest("[data-finish-task]");
    if (finishTask) {
      finishExecution("task", finishTask.dataset.finishTask);
      return;
    }

    if (event.target.closest("[data-cancel-edit]")) {
      editing = null;
      render();
      return;
    }

    const deleteSchedule = event.target.closest("[data-delete-schedule]");
    if (deleteSchedule) {
      const day = currentDay();
      const index = day.schedule.findIndex((item) => item.id === deleteSchedule.dataset.deleteSchedule);
      const removed = day.schedule[index];
      if (removed) {
        day.schedule.splice(index, 1);
        setUndo(`已删除时间表「${removed.title}」`, () => {
          day.schedule.splice(index, 0, removed);
        });
      }
      render();
      return;
    }

    const deleteTask = event.target.closest("[data-delete-task]");
    if (deleteTask) {
      const day = currentDay();
      const index = day.tasks.findIndex((item) => item.id === deleteTask.dataset.deleteTask);
      const removed = day.tasks[index];
      if (removed) {
        day.tasks.splice(index, 1);
        setUndo(`已删除任务「${removed.title}」`, () => {
          day.tasks.splice(index, 0, removed);
        });
      }
      render();
      return;
    }

    const deleteFood = event.target.closest("[data-delete-food]");
    if (deleteFood) {
      const day = currentDay();
      const index = day.foods.findIndex((item) => item.id === deleteFood.dataset.deleteFood);
      const removed = day.foods[index];
      if (removed) {
        day.foods.splice(index, 1);
        setUndo(`已删除饮食「${removed.name}」`, () => {
          day.foods.splice(index, 0, removed);
        });
      }
      render();
      return;
    }

    const saveFoodLibrary = event.target.closest("[data-save-food-library]");
    if (saveFoodLibrary) {
      const food = currentDay().foods.find((item) => item.id === saveFoodLibrary.dataset.saveFoodLibrary);
      if (food) addFoodToLibrary(food);
      render();
      return;
    }

    const useFoodLibrary = event.target.closest("[data-use-food-library]");
    if (useFoodLibrary) {
      const food = state.foodLibrary.find((item) => item.id === useFoodLibrary.dataset.useFoodLibrary);
      if (food) fillFoodForm(food);
      return;
    }

    const deleteFoodLibrary = event.target.closest("[data-delete-food-library]");
    if (deleteFoodLibrary) {
      const index = state.foodLibrary.findIndex((item) => item.id === deleteFoodLibrary.dataset.deleteFoodLibrary);
      const removed = state.foodLibrary[index];
      if (removed) {
        state.foodLibrary.splice(index, 1);
        setUndo(`已删除常吃食物「${removed.name}」`, () => {
          state.foodLibrary.splice(index, 0, removed);
        });
      }
      render();
      return;
    }

    if (event.target.closest("[data-undo]")) {
      undoAction?.restore();
      undoAction = null;
      render();
      return;
    }

    if (event.target.closest("[data-dismiss-undo]")) {
      undoAction = null;
      renderUndoToast();
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-note-schedule]")) {
      const item = currentDay().schedule.find((entry) => entry.id === event.target.dataset.noteSchedule);
      if (item) item.note = event.target.value.trim();
      render();
    }
    if (event.target.matches("[data-note-task]")) {
      const item = currentDay().tasks.find((entry) => entry.id === event.target.dataset.noteTask);
      if (item) item.note = event.target.value.trim();
      render();
    }
  });

  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-edit-form]");
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form);
    if (form.dataset.editForm === "schedule") {
      const item = currentDay().schedule.find((entry) => entry.id === form.dataset.editId);
      if (item) {
        item.time = String(data.get("time") || item.time);
        item.title = String(data.get("title") || item.title).trim();
        item.durationMinutes = Number(data.get("durationMinutes") || item.durationMinutes);
        item.note = String(data.get("note") || "").trim();
      }
    }
    if (form.dataset.editForm === "task") {
      const item = currentDay().tasks.find((entry) => entry.id === form.dataset.editId);
      if (item) {
        item.title = String(data.get("title") || item.title).trim();
        item.durationMinutes = Number(data.get("durationMinutes") || item.durationMinutes);
        item.note = String(data.get("note") || "").trim();
      }
    }
    if (form.dataset.editForm === "food") {
      const item = currentDay().foods.find((entry) => entry.id === form.dataset.editId);
      if (item) {
        item.time = String(data.get("time") || item.time);
        item.name = String(data.get("name") || item.name).trim();
        item.calories = Number(data.get("calories") || 0);
        item.protein = Number(data.get("protein") || 0);
        item.fat = Number(data.get("fat") || 0);
        item.carbs = Number(data.get("carbs") || 0);
      }
    }
    editing = null;
    render();
  });

  $("#bodyForm").addEventListener("input", () => {
    for (const key of ["sex", "age", "height", "weight", "fitnessGoal", "activity"]) {
      state.body[key] = $(`#${key}`).value;
    }
    render();
  });

  $("#wakeTime").addEventListener("change", (event) => {
    state.body.wakeTime = event.target.value || "07:30";
    applyRoutineDefaultsFromTomorrow();
    render();
  });

  $("#sleepTime").addEventListener("change", (event) => {
    state.body.sleepTime = event.target.value || "23:30";
    applyRoutineDefaultsFromTomorrow();
    render();
  });

  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `plan-app-backup-${todayKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  $("#importFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    state = mergeDefaults(JSON.parse(text));
    render();
  });

  $("#resetDemoBtn").addEventListener("click", () => {
    if (!window.confirm("确定清空今天的任务和饮食，并重置时间表状态吗？")) return;
    const day = currentDay();
    day.schedule = day.schedule.map((item) => ({
      ...item,
      status: "planned",
      note: "",
      startedAt: "",
      completedAt: "",
      actualMinutes: 0,
      history: []
    }));
    day.tasks = [];
    day.foods = [];
    render();
  });
}

function setupWheelInputs() {
  const configs = [
    ["datePicker", "date"],
    ["blockTime", "time"],
    ["foodTime", "time"],
    ["wakeTime", "time"],
    ["sleepTime", "time"],
    ["blockDuration", "duration"],
    ["taskDuration", "duration"],
    ["sex", "choice"],
    ["fitnessGoal", "choice"],
    ["activity", "choice"]
  ];
  for (const [id, type, options = {}] of configs) {
    const input = $(`#${id}`);
    if (!input) continue;
    input.dataset.wheelType = type;
    input.readOnly = true;
    input.addEventListener("mousedown", (event) => {
      if (input.tagName === "SELECT") event.preventDefault();
    });
    input.addEventListener("click", (event) => {
      event.preventDefault();
      openPicker(input, type, options);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPicker(input, type, options);
      }
    });
  }
  $("#pickerCancel").addEventListener("click", closePicker);
  $("#pickerBackdrop").addEventListener("click", (event) => {
    if (event.target.id === "pickerBackdrop") closePicker();
  });
  $("#pickerDone").addEventListener("click", applyPicker);
  $("#pickerBody").addEventListener("click", (event) => {
    const option = event.target.closest(".picker-option");
    if (!option) return;
    const column = option.closest(".picker-column");
    column.scrollTo({
      top: option.offsetTop - column.clientHeight / 2 + option.clientHeight / 2,
      behavior: "smooth"
    });
  });
  $("#pickerBody").addEventListener("scroll", (event) => {
    const column = event.target.closest?.(".picker-column");
    if (!column) return;
    maintainLoopPosition(column);
  }, true);
}

function openPicker(input, type, options) {
  activePicker = { input, type, options };
  $("#pickerTitle").textContent = pickerTitle(input, type);
  $("#pickerBody").innerHTML = pickerColumns(input.value, type, options);
  $("#pickerBackdrop").hidden = false;
  requestAnimationFrame(() => {
    document.querySelectorAll(".picker-column").forEach((column) => {
      const selected = column.querySelector(".picker-option.selected");
      if (selected) column.scrollTop = selected.offsetTop - column.clientHeight / 2 + selected.clientHeight / 2;
    });
  });
}

function closePicker() {
  $("#pickerBackdrop").hidden = true;
  $("#pickerBody").innerHTML = "";
  activePicker = null;
}

function maintainLoopPosition(column) {
  const options = Array.from(column.querySelectorAll(".picker-option"));
  if (options.length < 8) return;
  const center = column.scrollTop + column.clientHeight / 2;
  const current = options.reduce((best, option) => {
    const optionCenter = option.offsetTop + option.clientHeight / 2;
    const distance = Math.abs(optionCenter - center);
    return distance < best.distance ? { option, distance } : best;
  }, { option: options[0], distance: Infinity }).option;
  const currentIndex = options.indexOf(current);
  const lowerEdge = Math.floor(options.length * 0.22);
  const upperEdge = Math.floor(options.length * 0.78);
  if (currentIndex > lowerEdge && currentIndex < upperEdge) return;
  const sameValue = options
    .map((option, index) => ({ option, index }))
    .filter((entry) => entry.option.dataset.value === current.dataset.value);
  const target = sameValue[Math.floor(sameValue.length / 2)]?.option;
  if (!target || target === current) return;
  column.scrollTop = target.offsetTop - column.clientHeight / 2 + target.clientHeight / 2;
}

function applyPicker() {
  if (!activePicker) return;
  const values = Array.from(document.querySelectorAll(".picker-column")).map((column) => {
    const options = Array.from(column.querySelectorAll(".picker-option"));
    const center = column.scrollTop + column.clientHeight / 2;
    return options.reduce((best, option) => {
      const optionCenter = option.offsetTop + option.clientHeight / 2;
      const distance = Math.abs(optionCenter - center);
      return distance < best.distance ? { value: option.dataset.value, distance } : best;
    }, { value: options[0]?.dataset.value || "", distance: Infinity }).value;
  });
  activePicker.input.value = pickerValue(values, activePicker.type);
  activePicker.input.dispatchEvent(new Event("change", { bubbles: true }));
  activePicker.input.dispatchEvent(new Event("input", { bubbles: true }));
  closePicker();
}

function pickerTitle(input, type) {
  if (type === "choice") return input.closest("label")?.firstChild?.textContent?.trim() || "选择";
  if (type === "date") return "选择日期";
  if (type === "time") return "选择时间";
  if (type === "duration") return "选择时长";
  return input.closest("label")?.firstChild?.textContent?.trim() || "选择数值";
}

function pickerColumns(value, type, options) {
  if (type === "choice") {
    const items = Array.from(activePicker.input.options).map((option) => [option.value, option.textContent]);
    return column(items, String(value || items[0]?.[0] || ""));
  }
  if (type === "date") {
    const date = value ? dateFromKey(value) : new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const days = daysInMonth(year, month);
    return [
      column(range(2020, 2035).map((year) => [`${year}`, `${year}年`]), String(year)),
      column(loopItems(range(1, 12).map((month) => [pad(month), `${month}月`]), 5), pad(month)),
      column(loopItems(range(1, days).map((day) => [pad(day), `${day}日`]), 5), pad(Math.min(date.getDate(), days)))
    ].join("");
  }
  if (type === "time") {
    const [hour = "08", minute = "00"] = String(value || "08:00").split(":");
    return [
      column(loopItems(range(0, 23).map((item) => [pad(item), `${pad(item)}时`]), 5), pad(hour)),
      column(loopItems(range(0, 55, 5).map((item) => [pad(item), `${pad(item)}分`]), 7), pad(Math.round(Number(minute || 0) / 5) * 5))
    ].join("");
  }
  if (type === "duration") {
    const selected = String(value || 30);
    return column(loopItems(range(5, 360, 5).map((item) => [`${item}`, `${item}分钟`]), 3), selected);
  }
  if (type === "decimal") {
    const selected = String(Number(value || options.min).toFixed(1));
    return column(loopItems(decimalRange(options.min, options.max, options.step).map((item) => [item.toFixed(1), `${item.toFixed(1)}${options.suffix || ""}`]), 3), selected);
  }
  const selected = String(value || options.min);
  return column(loopItems(range(options.min, options.max).map((item) => [`${item}`, `${item}${options.suffix || ""}`]), 3), selected);
}

function pickerValue(values, type) {
  if (type === "date") {
    const year = Number(values[0]);
    const month = Number(values[1]);
    const day = Math.min(Number(values[2]), daysInMonth(year, month));
    return `${year}-${pad(month)}-${pad(day)}`;
  }
  if (type === "time") return `${values[0]}:${values[1]}`;
  return values[0];
}

function daysInMonth(year, month) {
  return new Date(Number(year), Number(month), 0).getDate();
}

function column(items, selected) {
  const selectedIndexes = items.map(([value], index) => String(value) === String(selected) ? index : -1).filter((index) => index >= 0);
  const targetIndex = selectedIndexes[Math.floor(selectedIndexes.length / 2)] ?? selectedIndexes[0];
  return `
    <div class="picker-column">
      <div class="picker-spacer"></div>
      ${items.map(([value, label], index) => {
        const isSelected = index === targetIndex;
        return `<button class="picker-option ${isSelected ? "selected" : ""}" data-value="${value}" type="button">${label}</button>`;
      }).join("")}
      <div class="picker-spacer"></div>
    </div>
  `;
}

function loopItems(items, times) {
  return Array.from({ length: times }, () => items).flat();
}

function range(start, end, step = 1) {
  const result = [];
  for (let value = start; value <= end; value += step) result.push(value);
  return result;
}

function decimalRange(start, end, step) {
  const result = [];
  for (let value = start; value <= end + 0.0001; value += step) result.push(Number(value.toFixed(1)));
  return result;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDuration(minutes) {
  const value = Number(minutes || 0);
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

function updateStatus(type, id, value) {
  const collection = type === "schedule" ? currentDay().schedule : currentDay().tasks;
  const item = collection.find((entry) => entry.id === id);
  if (item) {
    const oldStatus = item.status;
    item.status = value;
    if (value === "done") {
      item.completedAt = item.completedAt || new Date().toISOString();
      if (item.startedAt) item.actualMinutes = minutesBetween(item.startedAt, item.completedAt);
    }
    if (value !== oldStatus) {
      pushHistory(item, `${statusLabel(type, oldStatus)} → ${statusLabel(type, value)}`);
    }
  }
  render();
}

function startExecution(type, id) {
  const collection = type === "schedule" ? currentDay().schedule : currentDay().tasks;
  const item = collection.find((entry) => entry.id === id);
  if (!item) return;
  item.startedAt = new Date().toISOString();
  item.completedAt = "";
  item.actualMinutes = 0;
  pushHistory(item, "开始记录");
  render();
}

function finishExecution(type, id) {
  const collection = type === "schedule" ? currentDay().schedule : currentDay().tasks;
  const item = collection.find((entry) => entry.id === id);
  if (!item) return;
  item.completedAt = new Date().toISOString();
  if (item.startedAt) item.actualMinutes = minutesBetween(item.startedAt, item.completedAt);
  item.status = "done";
  pushHistory(item, "完成并计时");
  render();
}

function pushHistory(item, label) {
  item.history = Array.isArray(item.history) ? item.history : [];
  item.history.push({
    at: new Date().toISOString(),
    label
  });
  if (item.history.length > 20) item.history = item.history.slice(-20);
}

function minutesBetween(start, end) {
  const diff = Math.round((new Date(end) - new Date(start)) / 60000);
  return Math.max(1, diff);
}

function formatClock(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function templateItemsFromSchedule(schedule) {
  return [...schedule]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((item) => ({
      time: item.time,
      title: item.title,
      durationMinutes: Number(item.durationMinutes || 30),
      note: item.note || ""
    }));
}

function scheduleFromTemplateItems(items) {
  return (items || []).map((item) => ({
    ...createSchedule(item.time, item.title, item.durationMinutes),
    note: item.note || ""
  }));
}

function replaceScheduleWithItems(items, undoLabel) {
  const day = currentDay();
  if (day.schedule.length && !window.confirm("当前日期已有时间表，确定覆盖吗？")) return;
  const previous = [...day.schedule];
  day.schedule = scheduleFromTemplateItems(items);
  setUndo(undoLabel, () => {
    day.schedule = previous;
  });
  render();
}

function addFoodToLibrary(food) {
  const name = String(food.name || "").trim();
  if (!name) return;
  const existingIndex = state.foodLibrary.findIndex((item) => item.name === name);
  const saved = {
    id: existingIndex >= 0 ? state.foodLibrary[existingIndex].id : uid("food-lib"),
    userId: state.userId,
    name,
    calories: Number(food.calories || 0),
    protein: Number(food.protein || 0),
    fat: Number(food.fat || 0),
    carbs: Number(food.carbs || 0),
    updatedAt: new Date().toISOString()
  };
  if (existingIndex >= 0) {
    state.foodLibrary.splice(existingIndex, 1, saved);
  } else {
    state.foodLibrary.unshift(saved);
  }
}

function fillFoodForm(food) {
  $("#foodTime").value = currentTimeValue();
  $("#foodName").value = food.name || "";
  $("#foodCalories").value = Number(food.calories || 0);
  $("#foodProtein").value = Number(food.protein || 0);
  $("#foodFat").value = Number(food.fat || 0);
  $("#foodCarbs").value = Number(food.carbs || 0);
  $("#foodName").focus();
}

function currentTimeValue() {
  const date = new Date();
  const rounded = Math.round(date.getMinutes() / 5) * 5;
  if (rounded >= 60) {
    date.setHours(date.getHours() + 1);
    date.setMinutes(0);
  } else {
    date.setMinutes(rounded);
  }
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function setUndo(label, restore) {
  undoAction = { label, restore };
}

function renderUndoToast() {
  const toast = $("#undoToast");
  if (!toast) return;
  if (!undoAction) {
    toast.hidden = true;
    toast.innerHTML = "";
    return;
  }
  toast.hidden = false;
  toast.innerHTML = `
    <span>${escapeHTML(undoAction.label)}</span>
    <button data-undo type="button">撤销</button>
    <button class="toast-close" data-dismiss-undo type="button" aria-label="关闭">×</button>
  `;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

bindEvents();
render();
