/* Study Planner + Pomodoro
   Tracks subjects, tasks, notes, schedules, exams, goals, sessions, and analytics.
*/
(function () {
  const STORAGE_KEY = 'study_planner_v3';
  const LEGACY_KEYS = ['study_planner_v2', 'study_planner_v1'];
  const DEFAULT_SUBJECTS = [
    { id: 'math', name: 'Mathematics', color: '#2563eb' },
    { id: 'science', name: 'Science', color: '#16a34a' },
    { id: 'english', name: 'English', color: '#db2777' }
  ];

  const $ = id => document.getElementById(id);

  const taskListEl = $('taskList');
  const emptyState = $('emptyState');
  const taskForm = $('taskForm');
  const titleInput = $('taskTitle');
  const estimateInput = $('taskEstimate');
  const dueInput = $('taskDue');
  const priorityInput = $('taskPriority');
  const taskSubjectInput = $('taskSubject');
  const taskExamInput = $('taskExam');
  const taskNotesInput = $('taskNotes');
  const statusFilter = $('statusFilter');
  const taskScopeLabel = $('taskScopeLabel');

  const subjectForm = $('subjectForm');
  const subjectNameInput = $('subjectName');
  const subjectColorInput = $('subjectColor');
  const subjectTabs = $('subjectTabs');
  const subjectActions = $('subjectActions');
  const selectedSubjectLabel = $('selectedSubjectLabel');
  const deleteSubjectBtn = $('deleteSubjectBtn');

  const goalForm = $('goalForm');
  const dailyGoalInput = $('dailyGoalInput');
  const examForm = $('examForm');
  const examNameInput = $('examName');
  const examSubjectInput = $('examSubject');
  const examDateInput = $('examDate');
  const examList = $('examList');

  const scheduleForm = $('scheduleForm');
  const scheduleTitleInput = $('scheduleTitle');
  const scheduleSubjectInput = $('scheduleSubject');
  const scheduleDateInput = $('scheduleDate');
  const scheduleStartInput = $('scheduleStart');
  const scheduleMinutesInput = $('scheduleMinutes');
  const scheduleList = $('scheduleList');

  const currentTaskEl = $('currentTask');
  const currentSubjectEl = $('currentSubject');
  const timerDisplay = $('timerDisplay');
  const startPauseBtn = $('startPauseBtn');
  const resetBtn = $('resetBtn');
  const skipBtn = $('skipBtn');
  const modeLabel = $('modeLabel');
  const pomodoroCountEl = $('pomodoroCount');
  const historyList = $('historyList');

  const todayStudyTimeEl = $('todayStudyTime');
  const goalProgressEl = $('goalProgress');
  const weekStudyTimeEl = $('weekStudyTime');
  const streakCountEl = $('streakCount');
  const openTaskCountEl = $('openTaskCount');
  const dueTodayCountEl = $('dueTodayCount');
  const subjectProgressList = $('subjectProgressList');
  const weeklyChart = $('weeklyChart');

  const settingsBtn = $('settingsBtn');
  const settingsModal = $('settingsModal');
  const closeSettings = $('closeSettings');
  const saveSettings = $('saveSettings');
  const workInput = $('workInput');
  const shortInput = $('shortInput');
  const longInput = $('longInput');
  const cyclesInput = $('cyclesInput');

  let state = {
    subjects: DEFAULT_SUBJECTS.map(subject => ({ ...subject })),
    tasks: [],
    exams: [],
    schedule: [],
    history: [],
    filters: { subjectId: 'all', status: 'open' },
    goals: { dailyMinutes: 120, streakMinimumMinutes: 30 },
    settings: { work: 25, short: 5, long: 15, cycles: 4 },
    current: { taskId: null, mode: 'work', remaining: 25 * 60, running: false, pomodoros: 0 }
  };

  let tickInterval = null;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function load() {
    const key = [STORAGE_KEY, ...LEGACY_KEYS].find(item => localStorage.getItem(item));
    if (!key) return;

    try {
      const saved = JSON.parse(localStorage.getItem(key));
      state = {
        ...state,
        ...saved,
        subjects: Array.isArray(saved.subjects) && saved.subjects.length
          ? saved.subjects
          : DEFAULT_SUBJECTS.map(subject => ({ ...subject })),
        exams: Array.isArray(saved.exams) ? saved.exams : [],
        schedule: Array.isArray(saved.schedule) ? saved.schedule : [],
        history: Array.isArray(saved.history) ? saved.history : [],
        filters: { ...state.filters, ...(saved.filters || {}) },
        goals: { ...state.goals, ...(saved.goals || {}) },
        settings: { ...state.settings, ...(saved.settings || {}) },
        current: { ...state.current, ...(saved.current || {}), running: false }
      };

      const fallbackSubject = state.subjects[0].id;
      state.tasks = (saved.tasks || []).map(task => ({
        ...task,
        subjectId: task.subjectId || fallbackSubject,
        examId: task.examId || '',
        notes: task.notes || '',
        completed: Boolean(task.completed),
        completedAt: task.completedAt || null,
        donePomodoros: Number(task.donePomodoros || 0)
      }));

      state.history = state.history.map(entry => {
        const task = state.tasks.find(item => item.id === entry.taskId);
        return {
          ...entry,
          subjectId: entry.subjectId || (task ? task.subjectId : ''),
          minutes: Number(entry.minutes || (entry.mode === 'work' && !entry.skipped ? state.settings.work : 0))
        };
      });
    } catch (error) {
      console.warn('Could not load saved planner data', error);
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;'
    }[char]));
  }

  function fmtSeconds(seconds) {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(safeSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${secs}`;
  }

  function formatMinutes(minutes) {
    const rounded = Math.max(0, Math.round(minutes));
    const hours = Math.floor(rounded / 60);
    const mins = rounded % 60;
    if (!hours) return `${mins}m`;
    if (!mins) return `${hours}h`;
    return `${hours}h ${mins}m`;
  }

  function dateIso(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function dateFromIso(iso) {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function addDays(iso, days) {
    const date = dateFromIso(iso);
    date.setDate(date.getDate() + days);
    return dateIso(date);
  }

  function dayLabel(iso) {
    return dateFromIso(iso).toLocaleDateString(undefined, { weekday: 'short' });
  }

  function getSubject(subjectId) {
    return state.subjects.find(subject => subject.id === subjectId);
  }

  function getExam(examId) {
    return state.exams.find(exam => exam.id === examId);
  }

  function getCurrentTask() {
    return state.tasks.find(task => task.id === state.current.taskId);
  }

  function studyEntries() {
    return state.history.filter(entry => entry.mode === 'work' && !entry.skipped && entry.minutes > 0);
  }

  function minutesForDate(iso) {
    return studyEntries()
      .filter(entry => dateIso(new Date(entry.timestamp)) === iso)
      .reduce((total, entry) => total + entry.minutes, 0);
  }

  function minutesForSubject(subjectId) {
    return studyEntries()
      .filter(entry => entry.subjectId === subjectId)
      .reduce((total, entry) => total + entry.minutes, 0);
  }

  function weeklyData() {
    const today = dateIso();
    return Array.from({ length: 7 }, (_, index) => {
      const iso = addDays(today, index - 6);
      return { iso, label: dayLabel(iso), minutes: minutesForDate(iso) };
    });
  }

  function weekMinutes() {
    return weeklyData().reduce((total, day) => total + day.minutes, 0);
  }

  function studyStreak() {
    let streak = 0;
    let cursor = dateIso();
    while (minutesForDate(cursor) >= state.goals.streakMinimumMinutes) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  function getVisibleTasks() {
    return state.tasks
      .filter(task => state.filters.subjectId === 'all' || task.subjectId === state.filters.subjectId)
      .filter(task => {
        if (state.filters.status === 'done') return task.completed;
        if (state.filters.status === 'open') return !task.completed;
        return true;
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
        if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
        if (a.due && !b.due) return -1;
        if (!a.due && b.due) return 1;
        return (b.created || 0) - (a.created || 0);
      });
  }

  function fillSubjectSelect(select, includeAll) {
    select.innerHTML = includeAll ? '<option value="">All subjects</option>' : '';
    state.subjects.forEach(subject => {
      const option = document.createElement('option');
      option.value = subject.id;
      option.textContent = subject.name;
      select.appendChild(option);
    });
  }

  function renderSubjects() {
    subjectTabs.innerHTML = '';
    const tabs = [{ id: 'all', name: 'All', color: '#475467' }, ...state.subjects];

    tabs.forEach(subject => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `subject-tab${state.filters.subjectId === subject.id ? ' active' : ''}`;
      button.innerHTML = `<span class="subject-dot" style="background:${subject.color}"></span><span>${escapeHtml(subject.name)}</span><span>${countOpenBySubject(subject.id)}</span>`;
      button.onclick = () => {
        state.filters.subjectId = subject.id;
        save();
        render();
      };
      subjectTabs.appendChild(button);
    });

    const activeSubject = getSubject(state.filters.subjectId);
    subjectActions.classList.toggle('hidden', !activeSubject);
    if (activeSubject) {
      selectedSubjectLabel.textContent = activeSubject.name;
      deleteSubjectBtn.onclick = () => deleteSubject(activeSubject.id);
    }

    fillSubjectSelect(taskSubjectInput, false);
    fillSubjectSelect(examSubjectInput, false);
    fillSubjectSelect(scheduleSubjectInput, false);

    if (activeSubject) {
      taskSubjectInput.value = activeSubject.id;
      examSubjectInput.value = activeSubject.id;
      scheduleSubjectInput.value = activeSubject.id;
    }
  }

  function renderExamOptions() {
    const selectedSubject = taskSubjectInput.value;
    taskExamInput.innerHTML = '<option value="">No exam</option>';
    state.exams
      .filter(exam => !selectedSubject || exam.subjectId === selectedSubject)
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach(exam => {
        const option = document.createElement('option');
        option.value = exam.id;
        option.textContent = `${exam.name} (${exam.date})`;
        taskExamInput.appendChild(option);
      });
  }

  function countOpenBySubject(subjectId) {
    if (subjectId === 'all') return state.tasks.filter(task => !task.completed).length;
    return state.tasks.filter(task => task.subjectId === subjectId && !task.completed).length;
  }

  function renderTasks() {
    const tasks = getVisibleTasks();
    taskListEl.innerHTML = '';
    emptyState.classList.toggle('hidden', tasks.length > 0);

    const activeSubject = getSubject(state.filters.subjectId);
    taskScopeLabel.textContent = activeSubject ? activeSubject.name : 'All subjects';

    tasks.forEach(task => {
      const subject = getSubject(task.subjectId) || state.subjects[0];
      const exam = getExam(task.examId);
      const li = document.createElement('li');
      li.className = `task-item${task.completed ? ' done' : ''}`;

      const progress = `${task.donePomodoros || 0}/${task.estimate || 1}`;
      const dueText = task.due ? `Due ${task.due}` : 'No due date';
      const noteMarkup = task.notes ? `<p class="task-notes">${escapeHtml(task.notes)}</p>` : '';
      const examMarkup = exam ? `<span>Exam ${escapeHtml(exam.name)}</span>` : '';

      li.innerHTML = `
        <input class="task-check" type="checkbox" ${task.completed ? 'checked' : ''} aria-label="Mark ${escapeHtml(task.title)} complete">
        <div>
          <span class="task-title">${escapeHtml(task.title)}</span>
          <div class="task-meta">
            <span class="subject-pill" style="background:${subject.color}">${escapeHtml(subject.name)}</span>
            <span>${progress} pomodoros</span>
            <span>${dueText}</span>
            ${examMarkup}
            <span class="priority-${task.priority}">${task.priority}</span>
          </div>
          ${noteMarkup}
        </div>
        <div class="task-actions">
          <button type="button" data-action="start">Start</button>
          <button type="button" data-action="edit">Edit</button>
          <button type="button" data-action="delete">Delete</button>
        </div>
      `;

      li.querySelector('.task-check').onchange = event => toggleTask(task.id, event.target.checked);
      li.querySelector('[data-action="start"]').onclick = () => selectTask(task.id);
      li.querySelector('[data-action="edit"]').onclick = () => editTask(task.id);
      li.querySelector('[data-action="delete"]').onclick = () => deleteTask(task.id);
      taskListEl.appendChild(li);
    });
  }

  function renderSummary() {
    const today = dateIso();
    const todayMinutes = minutesForDate(today);
    const goal = Math.max(1, state.goals.dailyMinutes || 120);
    todayStudyTimeEl.textContent = formatMinutes(todayMinutes);
    goalProgressEl.textContent = `${Math.min(999, Math.round((todayMinutes / goal) * 100))}%`;
    weekStudyTimeEl.textContent = formatMinutes(weekMinutes());
    const streak = studyStreak();
    streakCountEl.textContent = `${streak} ${streak === 1 ? 'day' : 'days'}`;
    openTaskCountEl.textContent = state.tasks.filter(task => !task.completed).length;
    dueTodayCountEl.textContent = state.tasks.filter(task => !task.completed && task.due === today).length;
  }

  function renderSubjectProgress() {
    subjectProgressList.innerHTML = '';
    state.subjects.forEach(subject => {
      const tasks = state.tasks.filter(task => task.subjectId === subject.id);
      const done = tasks.filter(task => task.completed).length;
      const total = tasks.length;
      const plannedPomodoros = tasks.reduce((sum, task) => sum + Number(task.estimate || 0), 0);
      const completedPomodoros = tasks.reduce((sum, task) => sum + Number(task.donePomodoros || 0), 0);
      const percent = total ? Math.round((done / total) * 100) : 0;
      const minutes = minutesForSubject(subject.id);

      const row = document.createElement('div');
      row.className = 'progress-row';
      row.innerHTML = `
        <div class="progress-title">
          <span><span class="subject-dot" style="background:${subject.color}"></span>${escapeHtml(subject.name)}</span>
          <strong>${formatMinutes(minutes)}</strong>
        </div>
        <div class="progress-track"><span style="width:${percent}%"></span></div>
        <div class="progress-meta">${done}/${total} tasks done, ${completedPomodoros}/${plannedPomodoros || 0} planned pomodoros completed</div>
      `;
      subjectProgressList.appendChild(row);
    });
  }

  function renderWeeklyChart() {
    const data = weeklyData();
    const max = Math.max(30, ...data.map(day => day.minutes));
    weeklyChart.innerHTML = '';
    data.forEach(day => {
      const bar = document.createElement('div');
      bar.className = 'bar-column';
      bar.innerHTML = `
        <div class="bar-fill" style="height:${Math.max(4, (day.minutes / max) * 100)}%"></div>
        <span>${day.label}</span>
        <small>${formatMinutes(day.minutes)}</small>
      `;
      weeklyChart.appendChild(bar);
    });
  }

  function renderExams() {
    examList.innerHTML = '';
    const upcoming = [...state.exams].sort((a, b) => a.date.localeCompare(b.date));
    upcoming.forEach(exam => {
      const subject = getSubject(exam.subjectId);
      const days = Math.ceil((dateFromIso(exam.date) - dateFromIso(dateIso())) / 86400000);
      const li = document.createElement('li');
      li.innerHTML = `
        <span><strong>${escapeHtml(exam.name)}</strong> ${subject ? escapeHtml(subject.name) : ''} ${days >= 0 ? `${days} days` : 'past'}</span>
        <button type="button">Delete</button>
      `;
      li.querySelector('button').onclick = () => deleteExam(exam.id);
      examList.appendChild(li);
    });
  }

  function renderSchedule() {
    scheduleList.innerHTML = '';
    const items = [...state.schedule]
      .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
      .slice(0, 10);

    items.forEach(block => {
      const subject = getSubject(block.subjectId);
      const li = document.createElement('li');
      li.innerHTML = `
        <span><strong>${escapeHtml(block.title)}</strong> ${block.date} ${block.start || ''} ${formatMinutes(block.minutes)} ${subject ? escapeHtml(subject.name) : ''}</span>
        <button type="button">Delete</button>
      `;
      li.querySelector('button').onclick = () => deleteScheduleBlock(block.id);
      scheduleList.appendChild(li);
    });
  }

  function addSubject(event) {
    event.preventDefault();
    const name = subjectNameInput.value.trim();
    if (!name) return alert('Enter a subject name');

    const subject = { id: uid(), name, color: subjectColorInput.value || '#2563eb' };
    state.subjects.push(subject);
    state.filters.subjectId = subject.id;
    subjectNameInput.value = '';
    save();
    render();
  }

  function deleteSubject(subjectId) {
    const subject = getSubject(subjectId);
    if (!subject) return;
    if (state.subjects.length === 1) return alert('Keep at least one subject in your planner.');

    const subjectTasks = state.tasks.filter(task => task.subjectId === subjectId);
    const message = subjectTasks.length
      ? `Delete ${subject.name} and its ${subjectTasks.length} task(s)?`
      : `Delete ${subject.name}?`;
    if (!confirm(message)) return;

    state.subjects = state.subjects.filter(item => item.id !== subjectId);
    state.tasks = state.tasks.filter(task => task.subjectId !== subjectId);
    state.exams = state.exams.filter(exam => exam.subjectId !== subjectId);
    state.schedule = state.schedule.filter(block => block.subjectId !== subjectId);

    if (state.current.taskId && !state.tasks.some(task => task.id === state.current.taskId)) {
      state.current.taskId = null;
      pauseTimer();
    }
    if (state.filters.subjectId === subjectId) state.filters.subjectId = 'all';
    save();
    render();
  }

  function addTask(event) {
    event.preventDefault();
    const title = titleInput.value.trim();
    if (!title) return alert('Enter a task title');

    const selectedSubject = taskSubjectInput.value || state.subjects[0].id;
    const task = {
      id: uid(),
      title,
      subjectId: selectedSubject,
      examId: taskExamInput.value || '',
      estimate: Math.max(1, parseInt(estimateInput.value, 10) || 1),
      donePomodoros: 0,
      due: dueInput.value || null,
      priority: priorityInput.value || 'medium',
      notes: taskNotesInput.value.trim(),
      completed: false,
      completedAt: null,
      created: Date.now()
    };

    state.tasks.push(task);
    state.filters.subjectId = selectedSubject;
    state.filters.status = 'open';
    clearTaskForm();
    save();
    render();
  }

  function clearTaskForm() {
    titleInput.value = '';
    estimateInput.value = '';
    dueInput.value = '';
    priorityInput.value = 'medium';
    taskExamInput.value = '';
    taskNotesInput.value = '';
  }

  function editTask(id) {
    const task = state.tasks.find(item => item.id === id);
    if (!task) return;

    const newTitle = prompt('Task title', task.title);
    if (newTitle === null) return;
    const newEstimate = prompt('Estimated pomodoros', task.estimate);
    if (newEstimate === null) return;
    const newNotes = prompt('Notes', task.notes || '');
    if (newNotes === null) return;

    task.title = newTitle.trim() || task.title;
    task.estimate = Math.max(1, parseInt(newEstimate, 10) || task.estimate);
    task.notes = newNotes.trim();
    save();
    render();
  }

  function deleteTask(id) {
    if (!confirm('Delete this task?')) return;
    state.tasks = state.tasks.filter(task => task.id !== id);
    if (state.current.taskId === id) {
      state.current.taskId = null;
      pauseTimer();
    }
    save();
    render();
  }

  function toggleTask(id, completed) {
    const task = state.tasks.find(item => item.id === id);
    if (!task) return;
    task.completed = completed;
    task.completedAt = completed ? Date.now() : null;
    save();
    render();
  }

  function selectTask(id) {
    state.current.taskId = id;
    save();
    renderCurrent();
    renderTasks();
  }

  function addExam(event) {
    event.preventDefault();
    const name = examNameInput.value.trim();
    if (!name) return alert('Enter an exam name');
    if (!examDateInput.value) return alert('Choose an exam date');

    state.exams.push({
      id: uid(),
      name,
      subjectId: examSubjectInput.value || state.subjects[0].id,
      date: examDateInput.value,
      created: Date.now()
    });

    examNameInput.value = '';
    examDateInput.value = '';
    save();
    render();
  }

  function deleteExam(id) {
    state.exams = state.exams.filter(exam => exam.id !== id);
    state.tasks.forEach(task => {
      if (task.examId === id) task.examId = '';
    });
    save();
    render();
  }

  function saveGoal(event) {
    event.preventDefault();
    state.goals.dailyMinutes = Math.max(15, parseInt(dailyGoalInput.value, 10) || 120);
    save();
    render();
  }

  function addScheduleBlock(event) {
    event.preventDefault();
    const title = scheduleTitleInput.value.trim();
    if (!title) return alert('Enter a study block title');
    if (!scheduleDateInput.value) return alert('Choose a schedule date');

    state.schedule.push({
      id: uid(),
      title,
      subjectId: scheduleSubjectInput.value || state.subjects[0].id,
      date: scheduleDateInput.value,
      start: scheduleStartInput.value || '',
      minutes: Math.max(15, parseInt(scheduleMinutesInput.value, 10) || 60),
      created: Date.now()
    });

    scheduleTitleInput.value = '';
    scheduleStartInput.value = '';
    scheduleMinutesInput.value = '';
    save();
    render();
  }

  function deleteScheduleBlock(id) {
    state.schedule = state.schedule.filter(block => block.id !== id);
    save();
    render();
  }

  function applySettingsToCurrent() {
    const settings = state.settings;
    if (state.current.mode === 'work') state.current.remaining = settings.work * 60;
    if (state.current.mode === 'short') state.current.remaining = settings.short * 60;
    if (state.current.mode === 'long') state.current.remaining = settings.long * 60;
  }

  function startTimer() {
    if (state.current.running) return;
    state.current.running = true;
    save();
    tickInterval = setInterval(() => {
      state.current.remaining -= 1;
      if (state.current.remaining <= 0) completeSession(false);
      renderCurrent();
    }, 1000);
    renderCurrent();
  }

  function pauseTimer() {
    state.current.running = false;
    clearInterval(tickInterval);
    tickInterval = null;
    save();
    renderCurrent();
  }

  function resetTimer() {
    state.current.running = false;
    clearInterval(tickInterval);
    tickInterval = null;
    applySettingsToCurrent();
    save();
    renderCurrent();
  }

  function skipSession() {
    state.current.running = false;
    completeSession(true);
  }

  function completeSession(skipped) {
    clearInterval(tickInterval);
    tickInterval = null;
    const previousMode = state.current.mode;
    const task = getCurrentTask();
    const subjectId = task ? task.subjectId : '';
    const minutes = previousMode === 'work' && !skipped ? state.settings.work : 0;

    state.history.unshift({
      id: uid(),
      mode: previousMode,
      taskId: state.current.taskId,
      subjectId,
      minutes,
      timestamp: Date.now(),
      skipped: Boolean(skipped)
    });

    if (previousMode === 'work') {
      state.current.pomodoros = (state.current.pomodoros || 0) + 1;
      if (task && !skipped) {
        task.donePomodoros = (task.donePomodoros || 0) + 1;
        if (task.donePomodoros >= task.estimate) {
          task.completed = true;
          task.completedAt = Date.now();
        }
      }
      state.current.mode = state.current.pomodoros % (state.settings.cycles || 4) === 0 ? 'long' : 'short';
    } else {
      state.current.mode = 'work';
    }

    state.current.running = false;
    applySettingsToCurrent();
    notifyModeChange(previousMode);
    save();
    render();
  }

  function notifyModeChange(previousMode) {
    try {
      if (window.Notification && Notification.permission === 'granted') {
        new Notification('Study Planner', { body: `${labelMode(previousMode)} finished. Next: ${labelMode(state.current.mode)}.` });
      }
    } catch (error) {
      console.warn('Notification failed', error);
    }
  }

  function labelMode(mode) {
    if (mode === 'short') return 'Short break';
    if (mode === 'long') return 'Long break';
    return 'Work';
  }

  function renderCurrent() {
    const task = getCurrentTask();
    const subject = task ? getSubject(task.subjectId) : null;

    timerDisplay.textContent = fmtSeconds(state.current.remaining);
    modeLabel.textContent = labelMode(state.current.mode);
    pomodoroCountEl.textContent = state.current.pomodoros || 0;
    startPauseBtn.textContent = state.current.running ? 'Pause' : 'Start';
    currentTaskEl.textContent = task ? task.title : 'No task selected';
    currentSubjectEl.textContent = subject ? subject.name : 'No subject';
    currentSubjectEl.style.background = subject ? subject.color : '#475467';
  }

  function renderHistory() {
    historyList.innerHTML = '';
    state.history.slice(0, 20).forEach(entry => {
      const li = document.createElement('li');
      const task = state.tasks.find(item => item.id === entry.taskId);
      const suffix = task ? ` - ${task.title}` : '';
      const minutes = entry.minutes ? ` ${formatMinutes(entry.minutes)}` : '';
      li.textContent = `${new Date(entry.timestamp).toLocaleString()} - ${labelMode(entry.mode)}${minutes}${entry.skipped ? ' skipped' : ''}${suffix}`;
      historyList.appendChild(li);
    });
  }

  function renderSettings() {
    workInput.value = state.settings.work;
    shortInput.value = state.settings.short;
    longInput.value = state.settings.long;
    cyclesInput.value = state.settings.cycles;
    dailyGoalInput.value = state.goals.dailyMinutes;
    scheduleDateInput.value = dateIso();
  }

  function saveTimerSettings() {
    state.settings.work = Math.max(1, parseInt(workInput.value, 10) || 25);
    state.settings.short = Math.max(1, parseInt(shortInput.value, 10) || 5);
    state.settings.long = Math.max(1, parseInt(longInput.value, 10) || 15);
    state.settings.cycles = Math.max(1, parseInt(cyclesInput.value, 10) || 4);
    applySettingsToCurrent();
    settingsModal.classList.add('hidden');
    save();
    renderCurrent();
  }

  function render() {
    statusFilter.value = state.filters.status;
    renderSubjects();
    renderExamOptions();
    renderTasks();
    renderSummary();
    renderSubjectProgress();
    renderWeeklyChart();
    renderExams();
    renderSchedule();
    renderCurrent();
    renderHistory();
  }

  function bindEvents() {
    subjectForm.onsubmit = addSubject;
    deleteSubjectBtn.onclick = () => {
      const activeSubject = getSubject(state.filters.subjectId);
      if (activeSubject) deleteSubject(activeSubject.id);
    };
    taskForm.onsubmit = addTask;
    taskSubjectInput.onchange = renderExamOptions;
    statusFilter.onchange = () => {
      state.filters.status = statusFilter.value;
      save();
      render();
    };

    goalForm.onsubmit = saveGoal;
    examForm.onsubmit = addExam;
    scheduleForm.onsubmit = addScheduleBlock;

    startPauseBtn.onclick = () => state.current.running ? pauseTimer() : startTimer();
    resetBtn.onclick = resetTimer;
    skipBtn.onclick = skipSession;

    settingsBtn.onclick = () => settingsModal.classList.remove('hidden');
    closeSettings.onclick = () => settingsModal.classList.add('hidden');
    saveSettings.onclick = saveTimerSettings;
    settingsModal.onclick = event => {
      if (event.target === settingsModal) settingsModal.classList.add('hidden');
    };
  }

  function init() {
    load();
    if (!state.subjects.length) state.subjects = DEFAULT_SUBJECTS.map(subject => ({ ...subject }));
    if (!state.current.remaining) applySettingsToCurrent();
    renderSettings();
    bindEvents();
    render();

    if (window.Notification && Notification.permission === 'default') {
      try {
        Notification.requestPermission().catch(() => {});
      } catch (error) {
        console.warn('Notification permission request failed', error);
      }
    }
  }

  init();
  window.__studyPlanner = { state, save, render, selectTask };
})();
