import re
import os

files = [
    r'c:\Users\HP\OneDrive\Desktop\exam managemenat\Secure-EMS\frontend\src\ExamDashboard.jsx',
    r'c:\Users\HP\OneDrive\Desktop\exam managemenat\Secure-EMS\student-terminal\src\ExamDashboard.jsx'
]

for file_path in files:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Add state
    if 'selectedScheduleId' not in content:
        content = content.replace(
            "newSubjectCode: 'MATH-201',",
            "newSubjectCode: 'MATH-201',\n      selectedScheduleId: '',\n      pendingSchedules: [],"
        )
    
    # 2. Add extract to render
    if 'pendingSchedules' not in content.split('render() {')[1].split('return')[0]:
        content = content.replace(
            "const {\n      activeTab,",
            "const {\n      activeTab,\n      selectedScheduleId,\n      pendingSchedules,"
        )

    # 3. Add loadPendingSchedules method
    if 'loadPendingSchedules = ' not in content:
        content = content.replace(
            "  loadScheduledExams = async () => {",
            "  loadPendingSchedules = async () => {\n    try {\n      const response = await fetch(${API_BASE}/api/scheduled-exams);\n      const data = await response.json();\n      if (response.ok && Array.isArray(data.scheduled_exams)) {\n        this.setState({ pendingSchedules: data.scheduled_exams });\n      }\n    } catch (e) {\n      console.error('Failed to load scheduled exams', e);\n    }\n  };\n\n  loadScheduledExams = async () => {"
        )

    # 4. Add call to componentDidMount
    if 'this.loadPendingSchedules()' not in content:
        content = content.replace(
            "this.loadScheduledExams();",
            "this.loadPendingSchedules();\n    this.loadScheduledExams();"
        )

    # 5. Add to payload
    if 'delay_seconds: parseInt(newDelaySeconds, 10) || 10,' in content and 'schedule_id: this.state.selectedScheduleId' not in content:
        content = content.replace(
            "delay_seconds: parseInt(newDelaySeconds, 10) || 10,",
            "schedule_id: this.state.selectedScheduleId,\n          delay_seconds: parseInt(newDelaySeconds, 10) || 10,"
        )

    # 6. Update JSX
    old_jsx = '''<div className="grid grid-cols-1 gap-4">
                    <div>
                      <label htmlFor="new-subject-code" className="block text-xs uppercase tracking-wider text-slate-400 mb-1">
                        Subject Code
                      </label>
                      <input
                        id="new-subject-code"
                        type="text"
                        value={newSubjectCode}
                        onChange={(e) => this.setState({ newSubjectCode: e.target.value })}
                        placeholder="e.g. MATH-201, PHY-101"
                        className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-slate-100 font-mono text-sm focus:outline-none focus:border-amber-500"
                      />
                    </div>

                  </div>'''
    
    new_jsx = '''<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="schedule-select-legacy" className="block text-xs uppercase tracking-wider text-slate-400 mb-1 font-mono flex items-center gap-2">
                        <span>Link to Scheduled Exam</span>
                        <span className="bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded text-[10px]">RECOMMENDED</span>
                      </label>
                      <select
                        id="schedule-select-legacy"
                        value={selectedScheduleId}
                        onChange={(e) => {
                          const sched = pendingSchedules.find(s => s.schedule_id === e.target.value);
                          this.setState({
                            selectedScheduleId: e.target.value,
                            newSubjectCode: sched ? sched.subject_code : this.state.newSubjectCode
                          });
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-slate-100 font-mono text-sm focus:outline-none focus:border-amber-500 appearance-none"
                      >
                        <option value="">-- Select Scheduled Exam --</option>
                        {pendingSchedules.map(sched => (
                          <option key={sched.schedule_id} value={sched.schedule_id}>
                            {sched.subject_code} @ {sched.center_code} ({sched.exam_date} {sched.exam_time})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="new-subject-code" className="block text-xs uppercase tracking-wider text-slate-400 mb-1 font-mono">
                        Subject Code
                      </label>
                      <input
                        id="new-subject-code"
                        type="text"
                        value={newSubjectCode}
                        onChange={(e) => this.setState({ newSubjectCode: e.target.value })}
                        placeholder="e.g. MATH-201, PHY-101"
                        className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-slate-100 font-mono text-sm focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>'''
    
    content = content.replace(old_jsx, new_jsx)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Updated {file_path}")

