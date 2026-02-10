const { Plugin, Setting, showMessage } = require("siyuan");

const STORAGE_NAME = "time-record-config.json";

module.exports = class TimeRecordPlugin extends Plugin {
  // 配置
  config = {
    sidebarWidth: '480px',
    author: '恨水长秋',
    location: '倒悬山',
    timeIcon: '📅',
    authorIcon: '🎨',
    typeIcon: '📌'
  };

  // 全局状态
  currentData = [];
  currentFilter = 'all';
  currentTimeFilter = 'all';
  showStats = true;
  discoveredTypes = new Set();
  sidebarContainer = null;
  isLoading = false;
  lastRefreshTime = 0;
  dockInstance = null;
  isFirstLoad = true;
  
  // 仪表板状态
  dashboardInstance = null;
  dashboardOverlay = null;
  selectedDashboardType = 'all';
  selectedDashboardFilter = 'today';
  dashboardData = null;

  // 统计面板状态
  statsModalInstance = null;
  statsData = null;

  async onload() {
    console.log("时迹插件 已启用");

    // 加载配置
    await this.loadConfig();

    // 添加命令
    this.addCommand({
      langKey: "toggleTimeRecord",
      hotkey: "⌘⇧T",
      callback: () => {
        this.toggleSidebar();
      },
    });

    // 添加仪表板快捷键 (Alt+T)
    this.addCommand({
      langKey: "openDashboard",
      hotkey: "⌥T",
      callback: () => {
        this.toggleDashboard();
      },
    });

    // 添加统计面板快捷键 (Alt+S)
    this.addCommand({
      langKey: "openStatsPanel",
      hotkey: "⌥S",
      callback: () => {
        this.openStatsModal();
      },
    });

    // 添加停靠栏
    const DOCK_TYPE = "time_record_dock";
    this.addDock({
      config: {
        position: "RightBottom",
        size: { width: 480, height: 0 },
        icon: "iconCalendar",
        title: "时间记录",
        hotkey: "⌥⌘T",
      },
      data: {},
      type: DOCK_TYPE,
      init: (dock) => {
        this.dockInstance = dock;
        this.sidebarContainer = dock.element;
        this.initSidebar();
        this.sidebarContainer.style.cssText = `
          height: 100%;
          width: 100%;
          display: flex;
          flex-direction: column;
        `;
        this.loadTimeRecords();
      },
      show: () => {
        this.loadTimeRecords();
      },
      destroy: () => {}
    });

    // 添加设置面板
    this.initSettingPanel();

    // 初始化仪表板快捷键监听
    this.initDashboardHotkey();
  }

  async loadConfig() {
    this.data[STORAGE_NAME] = this.data[STORAGE_NAME] || {
      author: this.config.author,
      location: this.config.location,
      sidebarWidth: this.config.sidebarWidth,
      timeIcon: this.config.timeIcon,
      authorIcon: this.config.authorIcon,
      typeIcon: this.config.typeIcon
    };
    Object.assign(this.config, this.data[STORAGE_NAME]);
  }

  initSidebar() {
    if (!this.sidebarContainer) return;
    this.sidebarContainer.innerHTML = `
      <div class="time-record-container" style="height: 100%; width: 100%;">
        <div class="time-record-header">
          <h3>⏰ 时间记录</h3>
          <div class="header-actions">
            <button class="time-record-stats-btn" title="统计面板">📈</button>
            <button class="time-record-dashboard-btn" title="打开仪表板">📊</button>
            <button class="time-record-refresh" title="刷新数据">🔄</button>
          </div>
        </div>
        <div class="time-record-controls">
          <div class="control-buttons">
            <button class="control-btn active" id="stats-btn" title="显示统计信息">
              统计
            </button>
            <button class="control-btn active" data-time-filter="all" id="time-filter-all">
              全部时间
            </button>
            <button class="control-btn" data-time-filter="today" id="time-filter-today">
              今天
            </button>
            <button class="control-btn" data-time-filter="week" id="time-filter-week">
              本周
            </button>
            <button class="control-btn" data-time-filter="month" id="time-filter-month">
              本月
            </button>
            <button class="control-btn" data-time-filter="year" id="time-filter-year">
              今年
            </button>
          </div>
          <div class="filter-buttons" id="type-filters">
            <button class="filter-btn active" data-filter="all">全部类型</button>
          </div>
        </div>
        <div class="time-record-content" id="time-record-content">
          <div class="time-record-loading-container">
            <div class="time-record-loading-spinner"></div>
            <p>加载中...</p>
          </div>
        </div>
        <div class="time-record-footer">
          <span class="time-record-refresh-info">最后更新: <span class="time-record-last-refresh-time">刚刚</span></span>
          <span class="time-record-record-count">记录总数: <span class="time-record-total-count">0</span></span>
        </div>
      </div>
    `;

    this.bindSidebarEvents();
  }

  bindSidebarEvents() {
    if (!this.sidebarContainer) return;

    // 统计面板按钮
    const statsBtn = this.sidebarContainer.querySelector('.time-record-stats-btn');
    if (statsBtn) {
      statsBtn.addEventListener('click', () => {
        this.openStatsModal();
      });
    }

    // 仪表板按钮
    const dashboardBtn = this.sidebarContainer.querySelector('.time-record-dashboard-btn');
    if (dashboardBtn) {
      dashboardBtn.addEventListener('click', () => {
        this.toggleDashboard();
      });
    }

    // 刷新按钮
    const refreshBtn = this.sidebarContainer.querySelector('.time-record-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.loadTimeRecords();
      });
    }

    // 统计切换按钮
    const statsBtnInner = this.sidebarContainer.querySelector('#stats-btn');
    if (statsBtnInner) {
      statsBtnInner.addEventListener('click', () => {
        this.showStats = !this.showStats;
        statsBtnInner.classList.toggle('active', this.showStats);
        this.renderTimeline();
      });
    }

    // 时间筛选按钮
    this.sidebarContainer.querySelectorAll('[data-time-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentTimeFilter = btn.dataset.timeFilter;
        this.updateTimeFilterButtons();
        this.renderTimeline();
      });
    });

    // 类型筛选按钮
    const allBtn = this.sidebarContainer.querySelector('#type-filters .filter-btn[data-filter="all"]');
    if (allBtn) {
      allBtn.addEventListener('click', () => {
        this.sidebarContainer.querySelectorAll('#type-filters .filter-btn').forEach(b => b.classList.remove('active'));
        allBtn.classList.add('active');
        this.currentFilter = 'all';
        this.renderTimeline();
      });
    }
  }

  initSettingPanel() {
    const authorInput = document.createElement('input');
    authorInput.className = 'b3-text-field fn__block';
    authorInput.placeholder = '作者名称';
    authorInput.value = this.config.author;

    const locationInput = document.createElement('input');
    locationInput.className = 'b3-text-field fn__block';
    locationInput.placeholder = '地点';
    locationInput.value = this.config.location;

    const widthSelect = document.createElement('select');
    widthSelect.className = 'b3-select fn__block';
    ['320px', '400px', '480px', '560px', '640px'].forEach(width => {
      const option = document.createElement('option');
      option.value = width;
      option.textContent = width;
      option.selected = width === this.config.sidebarWidth;
      widthSelect.appendChild(option);
    });

    const timeIconInput = document.createElement('input');
    timeIconInput.className = 'b3-text-field fn__block';
    timeIconInput.placeholder = '时间图标，如：📅';
    timeIconInput.value = this.config.timeIcon;

    const authorIconInput = document.createElement('input');
    authorIconInput.className = 'b3-text-field fn__block';
    authorIconInput.placeholder = '作者图标，如：🎨';
    authorIconInput.value = this.config.authorIcon;

    const typeIconInput = document.createElement('input');
    typeIconInput.className = 'b3-text-field fn__block';
    typeIconInput.placeholder = '类型图标，如：📌';
    typeIconInput.value = this.config.typeIcon;

    this.setting = new Setting({
      confirmCallback: async () => {
        this.config.author = authorInput.value;
        this.config.location = locationInput.value;
        this.config.sidebarWidth = widthSelect.value;
        this.config.timeIcon = timeIconInput.value;
        this.config.authorIcon = authorIconInput.value;
        this.config.typeIcon = typeIconInput.value;
        await this.saveData(STORAGE_NAME, this.config);
        showMessage('配置已保存');
        if (this.sidebarContainer) {
          this.renderTimeline();
        }
      }
    });

    this.setting.addItem({
      title: '作者',
      description: '在时间记录中显示的作者名称',
      createActionElement: () => authorInput
    });

    this.setting.addItem({
      title: '地点',
      description: '在时间记录中显示的地点',
      createActionElement: () => locationInput
    });

    this.setting.addItem({
      title: '侧边栏宽度',
      description: '时间记录侧边栏的宽度',
      createActionElement: () => widthSelect
    });

    this.setting.addItem({
      title: '时间图标',
      description: '时间记录中时间前的图标',
      createActionElement: () => timeIconInput
    });

    this.setting.addItem({
      title: '作者图标',
      description: '时间记录中作者前的图标',
      createActionElement: () => authorIconInput
    });

    this.setting.addItem({
      title: '类型图标',
      description: '时间记录中类型前的图标',
      createActionElement: () => typeIconInput
    });
  }

  async executeSQL(sql) {
    try {
      const response = await fetch('/api/query/sql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ stmt: sql })
      });
      if (!response.ok) {
        throw new Error(`API调用失败: ${response.status}`);
      }
      const result = await response.json();
      return result.code === 0 ? (result.data || []) : [];
    } catch (error) {
      console.error('执行SQL失败:', error);
      return [];
    }
  }

  async fetchTimeRecords() {
    const sql = `
      SELECT
        b.id,
        b.content,
        b.created,
        a1.value as lifelog_created,
        a2.value as lifelog_type
      FROM blocks b
      LEFT JOIN attributes a1 ON b.id = a1.block_id AND a1.name = 'custom-lifelog-created'
      LEFT JOIN attributes a2 ON b.id = a2.block_id AND a2.name = 'custom-lifelog-type'
      WHERE
        b.type = 'p'
        AND a1.value IS NOT NULL
        AND a2.value IS NOT NULL
        AND b.hpath NOT LIKE '%template%'
      ORDER BY a1.value DESC
      LIMIT 500
    `;
    const records = await this.executeSQL(sql);
    return records.map(record => {
      let content = record.content || '';
      const timePrefixPatterns = [
        /^\d{1,2}:\d{2}(?::\d{2})?\s*[\s\S]{0,20}?[:：]\s*/,
        /^\d{1,2}:\d{2}(?::\d{2})?[\s\S]{0,20}?[:：]\s*/,
        /^\d{1,2}:\d{2}(?::\d{2})?\s+/,
        /^\[\d{1,2}:\d{2}(?::\d{2})?\]\s*[\s\S]{0,20}?[:：]\s*/,
        /^【\d{1,2}:\d{2}(?::\d{2})?】\s*[\s\S]{0,20}?[:：]\s*/,
        /^\(\d{1,2}:\d{2}(?::\d{2})?\)\s*[\s\S]{0,20}?[:：]\s*/,
        /^\d{1,2}:\d{2}(?::\d{2})?-\s*[\s\S]{0,20}?[:：]\s*/,
        /^\d{1,2}:\d{2}(?::\d{2})?\.\s*[\s\S]{0,20}?[:：]\s*/,
      ];
      let originalContent = content;
      for (const pattern of timePrefixPatterns) {
        const match = content.match(pattern);
        if (match) {
          content = content.substring(match[0].length);
          break;
        }
      }
      content = content.trim();
      if (!content && originalContent) {
        content = originalContent;
      }
      let recordType = record.lifelog_type || '记录';
      this.discoveredTypes.add(recordType);
      let dateObj = null;
      let displayDateTime = '';
      if (record.lifelog_created) {
        const datetimeMatch = record.lifelog_created.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/);
        if (datetimeMatch) {
          const [_, year, month, day, hour, minute] = datetimeMatch;
          const formattedMonth = month.padStart(2, '0');
          const formattedDay = day.padStart(2, '0');
          const formattedHour = hour.padStart(2, '0');
          const formattedMinute = minute.padStart(2, '0');
          displayDateTime = `${year}-${formattedMonth}-${formattedDay} ${formattedHour}:${formattedMinute}`;
          dateObj = new Date(year, parseInt(month) - 1, day, hour, minute);
        } else {
          const datetimeMatch2 = record.lifelog_created.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2})/);
          if (datetimeMatch2) {
            const [_, year, month, day, hour, minute] = datetimeMatch2;
            const formattedMonth = month.padStart(2, '0');
            const formattedDay = day.padStart(2, '0');
            const formattedHour = hour.padStart(2, '0');
            const formattedMinute = minute.padStart(2, '0');
            displayDateTime = `${year}-${formattedMonth}-${formattedDay} ${formattedHour}:${formattedMinute}`;
            dateObj = new Date(year, parseInt(month) - 1, day, hour, minute);
          } else {
            const dateMatch = record.lifelog_created.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
            if (dateMatch) {
              const [_, year, month, day] = dateMatch;
              const formattedMonth = month.padStart(2, '0');
              const formattedDay = day.padStart(2, '0');
              displayDateTime = `${year}-${formattedMonth}-${formattedDay}`;
              dateObj = new Date(year, parseInt(month) - 1, day);
            }
          }
        }
      }
      if (!displayDateTime) return null;
      return {
        id: record.id,
        content: content,
        type: recordType,
        displayDate: displayDateTime,
        dateObj: dateObj,
        dateString: record.lifelog_created,
        rawContent: record.content
      };
    }).filter(record => record !== null && record.content.trim() !== '');
  }

  createTimelineCard(record) {
    const cardEl = document.createElement('div');
    cardEl.className = 'timeline-card';
    const contentEl = document.createElement('div');
    contentEl.className = 'card-content';
    contentEl.textContent = record.content;
    const metaEl = document.createElement('div');
    metaEl.className = 'card-meta';
    const dateSpan = document.createElement('span');
    dateSpan.innerHTML = this.config.timeIcon + ' ' + record.displayDate;
    const authorSpan = document.createElement('span');
    authorSpan.innerHTML = this.config.authorIcon + ' ' + this.config.author;
    const typeSpan = document.createElement('span');
    typeSpan.innerHTML = this.config.typeIcon + record.type;
    const separator1 = document.createElement('span');
    separator1.className = 'meta-separator';
    separator1.textContent = '|';
    const separator2 = document.createElement('span');
    separator2.className = 'meta-separator';
    separator2.textContent = '|';
    metaEl.appendChild(dateSpan);
    metaEl.appendChild(separator1);
    metaEl.appendChild(authorSpan);
    metaEl.appendChild(separator2);
    metaEl.appendChild(typeSpan);
    cardEl.appendChild(contentEl);
    cardEl.appendChild(metaEl);
    return cardEl;
  }

  filterByTime(records, timeFilter) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return records.filter(record => {
      if (!record.dateObj) return false;
      const recordDate = record.dateObj;
      const recordTime = recordDate.getTime();
      switch(timeFilter) {
        case 'today':
          return recordDate.toDateString() === today.toDateString();
        case 'week':
          const weekAgo = new Date(today);
          weekAgo.setDate(today.getDate() - 7);
          return recordTime >= weekAgo.getTime();
        case 'month':
          const monthAgo = new Date(today);
          monthAgo.setMonth(today.getMonth() - 1);
          return recordTime >= monthAgo.getTime();
        case 'year':
          const yearAgo = new Date(today);
          yearAgo.setFullYear(today.getFullYear() - 1);
          return recordTime >= yearAgo.getTime();
        case 'all':
        default:
          return true;
      }
    });
  }

  filterByType(records, typeFilter) {
    if (!typeFilter || typeFilter === 'all') return records;
    return records.filter(record => record.type === typeFilter);
  }

  calculateStats(records) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayAgo = new Date(today);
    dayAgo.setDate(today.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setMonth(today.getMonth() - 1);
    const yearAgo = new Date(today);
    yearAgo.setFullYear(today.getFullYear() - 1);
    const stats = { day: 0, week: 0, month: 0, year: 0 };
    records.forEach(record => {
      if (record.dateObj) {
        const recordTime = record.dateObj.getTime();
        if (record.dateObj.toDateString() === today.toDateString()) {
          stats.day++;
        }
        if (recordTime >= weekAgo.getTime()) {
          stats.week++;
        }
        if (recordTime >= monthAgo.getTime()) {
          stats.month++;
        }
        if (recordTime >= yearAgo.getTime()) {
          stats.year++;
        }
      }
    });
    return stats;
  }

  calculateTypeDistribution(records) {
    const typeDistribution = {};
    records.forEach(record => {
      const type = record.type || '未分类';
      typeDistribution[type] = (typeDistribution[type] || 0) + 1;
    });
    return typeDistribution;
  }

  createStatsPanel(records) {
    const stats = this.calculateStats(records);
    const typeDistribution = this.calculateTypeDistribution(records);
    const typeNames = Object.keys(typeDistribution);
    const typeCounts = Object.values(typeDistribution);
    const sortedData = typeNames.map((name, index) => ({
      name,
      count: typeCounts[index]
    })).sort((a, b) => b.count - a.count);
    const total = sortedData.reduce((sum, item) => sum + item.count, 0);
    sortedData.forEach(item => {
      item.percentage = total > 0 ? ((item.count / total) * 100).toFixed(1) : "0.0";
    });

    const panel = document.createElement('div');
    panel.className = 'time-record-stats-panel';
    panel.innerHTML = `
      <h4>信息统计</h4>
      <div class="time-record-stats-grid">
        <div class="time-record-stat-item ${this.currentTimeFilter === 'today' ? 'active' : ''}" data-time-filter="today">
          <div class="time-record-stat-value">${stats.day}</div>
          <div class="time-record-stat-label">今日</div>
        </div>
        <div class="time-record-stat-item ${this.currentTimeFilter === 'week' ? 'active' : ''}" data-time-filter="week">
          <div class="time-record-stat-value">${stats.week}</div>
          <div class="time-record-stat-label">本周</div>
        </div>
        <div class="time-record-stat-item ${this.currentTimeFilter === 'month' ? 'active' : ''}" data-time-filter="month">
          <div class="time-record-stat-value">${stats.month}</div>
          <div class="time-record-stat-label">本月</div>
        </div>
        <div class="time-record-stat-item ${this.currentTimeFilter === 'year' ? 'active' : ''}" data-time-filter="year">
          <div class="time-record-stat-value">${stats.year}</div>
          <div class="time-record-stat-label">今年</div>
        </div>
      </div>
      <div class="time-record-chart-container">
        <div class="time-record-chart-title">类型分布统计</div>
        <div class="time-record-stats-chart-container" id="time-record-stats-chart">
        </div>
      </div>
    `;

    panel.querySelectorAll('.time-record-stat-item').forEach(item => {
      item.addEventListener('click', () => {
        this.currentTimeFilter = item.dataset.timeFilter;
        this.updateTimeFilterButtons();
        this.renderTimeline();
      });
    });

    const chartContainer = panel.querySelector('#time-record-stats-chart');
    if (chartContainer) {
      sortedData.forEach((item, index) => {
        const chartItem = document.createElement('div');
        chartItem.className = 'time-record-chart-item';
        const color = this.getTypeColor(item.name);
        const lightColor = this.lightenColor(color, 30);
        chartItem.innerHTML = `
          <div class="time-record-chart-label">${item.name}</div>
          <div class="time-record-chart-bar-container">
            <div class="time-record-chart-bar" style="width: ${item.percentage}%; background: linear-gradient(90deg, ${color}, ${lightColor})">
              <span class="time-record-chart-bar-value">${item.percentage}%</span>
            </div>
          </div>
          <div class="time-record-chart-info">
            <span class="time-record-chart-count">${item.count}笔</span>
            <span class="time-record-chart-percentage">${item.percentage}%</span>
          </div>
        `;
        chartContainer.appendChild(chartItem);
      });
    }

    return panel;
  }

  updateTimeFilterButtons() {
    if (!this.sidebarContainer) return;
    this.sidebarContainer.querySelectorAll('[data-time-filter]').forEach(btn => {
      btn.classList.remove('active');
    });
    const activeBtn = this.sidebarContainer.querySelector(`[data-time-filter="${this.currentTimeFilter}"]`);
    if (activeBtn) {
      activeBtn.classList.add('active');
    }
  }

  updateTypeFilterButtons() {
    if (!this.sidebarContainer) return;
    const filtersContainer = this.sidebarContainer.querySelector('#type-filters');
    if (!filtersContainer) return;
    const existingButtons = Array.from(filtersContainer.querySelectorAll('.filter-btn'));
    existingButtons.forEach(btn => {
      if (btn.dataset.filter !== 'all') {
        btn.remove();
      }
    });
    const allTypes = Array.from(this.discoveredTypes).sort();
    allTypes.forEach(type => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn';
      if (this.currentFilter === type) {
        btn.classList.add('active');
      }
      btn.dataset.filter = type;
      btn.textContent = type;
      btn.addEventListener('click', () => {
        filtersContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        this.renderTimeline();
      });
      filtersContainer.appendChild(btn);
    });
  }

  async loadTimeRecords() {
    if (!this.sidebarContainer || this.isLoading) return;
    const contentEl = this.sidebarContainer.querySelector('#time-record-content');
    if (!contentEl) return;
    this.isLoading = true;
    try {
      const refreshBtn = this.sidebarContainer.querySelector('.time-record-refresh');
      if (refreshBtn) {
        refreshBtn.classList.add('loading');
        refreshBtn.disabled = true;
      }
      contentEl.innerHTML = `
        <div class="time-record-loading-container">
          <div class="time-record-loading-spinner"></div>
          <p>加载中...</p>
        </div>
      `;
      const records = await this.fetchTimeRecords();
      this.currentData = records;
      this.updateTypeFilterButtons();
      this.renderTimeline();
      this.lastRefreshTime = Date.now();
      this.updateFooterInfo(records.length);
    } catch (error) {
      console.error('加载时间记录失败:', error);
      contentEl.innerHTML = `
        <div class="time-record-error-state">
          <div class="time-record-error-state-icon">⚠️</div>
          <p>加载失败</p>
          <p style="font-size: 12px; color: #999; margin-top: 8px;">${error.message || '未知错误'}</p>
          <button class="retry-btn" style="margin-top: 12px; padding: 8px 16px;
            background: #667eea; color: white;
            border: none; border-radius: 4px;
            cursor: pointer; font-size: 12px;">
            重试
          </button>
        </div>
      `;
      const retryBtn = contentEl.querySelector('.retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          this.loadTimeRecords();
        });
      }
    } finally {
      this.isLoading = false;
      const refreshBtn = this.sidebarContainer.querySelector('.time-record-refresh');
      if (refreshBtn) {
        refreshBtn.classList.remove('loading');
        refreshBtn.disabled = false;
      }
    }
  }

  renderTimeline() {
    if (!this.sidebarContainer) return;
    const contentEl = this.sidebarContainer.querySelector('#time-record-content');
    if (!contentEl) return;
    if (this.currentData.length === 0) {
      contentEl.innerHTML = `
        <div class="time-record-empty-state">
          <div class="time-record-empty-state-icon">📅</div>
          <p style="font-size: 14px; color: #999; margin-bottom: 8px;">还没有时间记录</p>
          <p style="font-size: 12px; color: #ccc;">
            请在文档中添加带有 custom-lifelog-created 和 custom-lifelog-type 属性的段落
          </p>
        </div>
      `;
      return;
    }
    let filteredRecords = this.filterByTime(this.currentData, this.currentTimeFilter);
    filteredRecords = this.filterByType(filteredRecords, this.currentFilter);
    contentEl.innerHTML = '';
    if (this.showStats && filteredRecords.length > 0) {
      const statsPanel = this.createStatsPanel(filteredRecords);
      contentEl.appendChild(statsPanel);
    }
    if (filteredRecords.length > 0) {
      const timelineEl = document.createElement('div');
      timelineEl.className = 'timeline-list';
      filteredRecords.forEach(record => {
        const cardEl = this.createTimelineCard(record);
        timelineEl.appendChild(cardEl);
      });
      contentEl.appendChild(timelineEl);
    } else {
      contentEl.innerHTML = `
        <div class="time-record-empty-state">
          <div class="time-record-empty-state-icon">🔍</div>
          <p style="font-size: 14px; color: #999; margin-bottom: 8px;">没有找到匹配的记录</p>
          <p style="font-size: 12px; color: #ccc;">请尝试选择其他筛选条件</p>
        </div>
      `;
    }
  }

  updateFooterInfo(totalCount) {
    if (!this.sidebarContainer) return;
    const lastRefreshEl = this.sidebarContainer.querySelector('.time-record-last-refresh-time');
    const totalCountEl = this.sidebarContainer.querySelector('.time-record-total-count');
    if (lastRefreshEl) {
      lastRefreshEl.textContent = this.formatTimeSince(this.lastRefreshTime);
    }
    if (totalCountEl) {
      totalCountEl.textContent = totalCount;
    }
  }

  formatTimeSince(timestamp) {
    const now = Date.now();
    const diff = Math.floor((now - timestamp) / 1000);
    if (diff < 10) return '刚刚';
    if (diff < 60) return `${diff}秒前`;
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    return `${Math.floor(diff / 86400)}天前`;
  }

  toggleSidebar() {
    if (this.dockInstance) {
      this.dockInstance.toggle();
    }
  }

  initDashboardHotkey() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.dashboardInstance) {
        this.closeDashboard();
      }
    }, true);
  }

  toggleDashboard() {
    if (this.dashboardInstance) {
      this.closeDashboard();
    } else {
      this.openDashboard();
    }
  }

  async openDashboard() {
    if (this.dashboardInstance) {
      this.closeDashboard();
      return;
    }

    this.dashboardOverlay = document.createElement('div');
    this.dashboardOverlay.className = 'tr-floating-overlay';
    this.dashboardOverlay.id = 'tr-dashboard-overlay';
    this.dashboardOverlay.addEventListener('click', () => this.closeDashboard());

    this.dashboardInstance = document.createElement('div');
    this.dashboardInstance.className = 'tr-time-analytics-floating';
    this.dashboardInstance.id = 'tr-time-analytics-dashboard';

    const decoration = document.createElement('div');
    decoration.className = 'tr-floating-decoration';

    const loadingState = document.createElement('div');
    loadingState.className = 'tr-floating-loading';
    loadingState.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
        <div style="width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid #4C6EF5; border-radius: 50%; animation: tr-spin 1s linear infinite; margin-bottom: 16px;"></div>
        <div style="font-size: 14px; color: #495057; font-weight: 600;">正在加载时间分析...</div>
      </div>
      <style>
        @keyframes tr-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;

    this.dashboardInstance.appendChild(decoration);
    this.dashboardInstance.appendChild(loadingState);

    document.body.appendChild(this.dashboardOverlay);
    document.body.appendChild(this.dashboardInstance);

    await this.loadDashboardData();
  }

  async loadDashboardData() {
    if (!this.dashboardInstance) return;

    try {
      const sql = `
        SELECT
          b.id,
          b.content,
          b.created,
          b.updated,
          b.type,
          b.hpath,
          b.box,
          a1.value as lifelog_created,
          a2.value as lifelog_type
        FROM blocks b
        LEFT JOIN attributes a1 ON b.id = a1.block_id AND a1.name = 'custom-lifelog-created'
        LEFT JOIN attributes a2 ON b.id = a2.block_id AND a2.name = 'custom-lifelog-type'
        WHERE
          b.type = 'p'
          AND a1.value IS NOT NULL
          AND a2.value IS NOT NULL
          AND b.hpath NOT LIKE '%template%'
        ORDER BY a1.value DESC
        LIMIT 200
      `;
      const records = await this.executeSQL(sql);
      this.dashboardData = this.processDashboardData(records);

      const loadingState = this.dashboardInstance.querySelector('.tr-floating-loading');
      if (loadingState) {
        this.dashboardInstance.removeChild(loadingState);
      }

      this.renderDashboard();
    } catch (error) {
      console.error('加载仪表板数据失败:', error);
      const loadingState = this.dashboardInstance.querySelector('.tr-floating-loading');
      if (loadingState) {
        loadingState.innerHTML = `
          <div style="text-align: center; padding: 40px;">
            <div style="font-size: 48px; color: #FA5252; margin-bottom: 12px;">❌</div>
            <div style="font-size: 14px; color: #FA5252; margin-bottom: 10px; font-weight: 700;">加载失败</div>
            <div style="font-size: 12px; color: #6C757D; margin-bottom: 20px; max-width: 280px;">${error.message}</div>
            <button class="tr-floating-btn primary" onclick="window.trPlugin.reloadDashboard()" style="margin: 0 auto; padding: 8px 16px; font-size: 12px;">重试</button>
          </div>
        `;
      }
    }
  }

  processDashboardData(records) {
    const result = {};
    const typeStats = {};
    let totalCount = 0;

    const formatDateString = (dateStr) => {
      if (!dateStr) return '';
      const match = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
      if (match) {
        const [_, year, month, day] = match;
        const formattedMonth = month.padStart(2, '0');
        const formattedDay = day.padStart(2, '0');
        return `${year}-${formattedMonth}-${formattedDay}`;
      }
      return dateStr;
    };

    records.forEach(record => {
      if (!record.lifelog_created) return;
      
      const date = formatDateString(record.lifelog_created.split(' ')[0]);
      if (!date) return;
      
      const time = record.lifelog_created.split(' ')[1] || '00:00:00';
      totalCount++;
      
      if (!result[date]) {
        result[date] = [];
      }
      const type = record.lifelog_type || '记录';
      
      if (!typeStats[type]) {
        typeStats[type] = { 
          count: 0, 
          records: [],
          color: this.getTypeColor(type),
          icon: this.getTypeIcon(type)
        };
      }
      typeStats[type].count++;
      typeStats[type].records.push(record);
      
      const dateTime = `${date} ${time}`;
      result[date].push({
        id: record.id,
        date: date,
        time: time,
        dateTime: dateTime,
        type: type,
        content: this.parseDashboardContent(record.content),
        fullContent: record.content,
        created: record.created,
        updated: record.updated
      });
    });

    Object.keys(result).forEach(date => {
      result[date].sort((a, b) => b.time.localeCompare(a.time));
    });

    const sortedDates = Object.keys(result).sort((a, b) => b.localeCompare(a));
    const sortedResult = {};
    sortedDates.forEach(date => {
      sortedResult[date] = result[date];
    });

    Object.keys(typeStats).forEach(type => {
      typeStats[type].percent = totalCount > 0 ?
        ((typeStats[type].count / totalCount) * 100).toFixed(1) : '0.0';
    });

    return {
      recordsByDate: sortedResult,
      typeStats: typeStats,
      totalCount: totalCount,
      uniqueDates: sortedDates.length,
      sortedDates: sortedDates
    };
  }

  parseDashboardContent(content) {
    if (!content) return '';
    const timePattern = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+/;
    if (timePattern.test(content)) {
      return content.replace(timePattern, '').trim();
    }
    return content.trim();
  }

  renderDashboard() {
    if (!this.dashboardInstance) return;

    const decoration = this.dashboardInstance.querySelector('.tr-floating-decoration');
    this.dashboardInstance.innerHTML = '';
    this.dashboardInstance.appendChild(decoration);

    const header = this.createDashboardHeader();
    this.dashboardInstance.appendChild(header);

    const content = this.createDashboardContent();
    this.dashboardInstance.appendChild(content);
  }

  createDashboardHeader() {
    const header = document.createElement('div');
    header.className = 'tr-floating-header';
    const latestDate = this.dashboardData.sortedDates[0] ? this.formatDate(new Date(this.dashboardData.sortedDates[0]), 'MM/DD') : '-';
    header.innerHTML = `
      <div class="tr-floating-title">
        <div class="tr-floating-icon">📊</div>
        <div>
          <div class="tr-floating-text">时间记录分析</div>
          <div class="tr-floating-sub">
            <span>${this.dashboardData.totalCount} 条记录</span>
            <span class="tr-floating-dot"></span>
            <span>${this.dashboardData.uniqueDates} 天</span>
            <span class="tr-floating-dot"></span>
            <span>已实时更新</span>
          </div>
        </div>
      </div>
      <div class="tr-floating-controls">
        <button class="tr-floating-btn" onclick="window.trPlugin.reloadDashboard()">
          <span class="icon">🔄</span>
          <span>刷新</span>
        </button>
        <button class="tr-floating-btn primary" onclick="window.trPlugin.closeDashboard()">
          <span class="icon">✕</span>
          <span>关闭</span>
        </button>
      </div>
    `;
    return header;
  }

  createDashboardContent() {
    const content = document.createElement('div');
    content.className = 'tr-floating-content';
    content.appendChild(this.createDashboardPanel());
    content.appendChild(this.createDashboardTimeline());
    return content;
  }

  createDashboardPanel() {
    const panel = document.createElement('div');
    panel.className = 'tr-floating-dashboard';

    const latestDate = this.dashboardData.sortedDates[0] ? this.formatDate(new Date(this.dashboardData.sortedDates[0]), 'MM/DD') : '-';
    panel.innerHTML = `
      <div class="tr-dashboard-stats">
        <div class="tr-dashboard-label">
          <span>📈</span>
          <span>统计概览</span>
        </div>
        <div class="tr-dashboard-stat active" onclick="window.trPlugin.filterDashboardByType('all')">
          <div class="tr-stat-container">
            <div class="tr-stat-title">总记录数</div>
            <div class="tr-stat-number">${this.dashboardData.totalCount}</div>
            <div class="tr-stat-description">共 ${this.dashboardData.uniqueDates} 天</div>
          </div>
        </div>
        <div class="tr-dashboard-stat" onclick="window.trPlugin.filterDashboardByDate('today')">
          <div class="tr-stat-container">
            <div class="tr-stat-title">今日记录</div>
            <div class="tr-stat-number">${this.getTodayRecordCount()}</div>
            <div class="tr-stat-description">今天</div>
          </div>
        </div>
        <div class="tr-dashboard-stat" onclick="window.trPlugin.filterDashboardByDate('week')">
          <div class="tr-stat-container">
            <div class="tr-stat-title">本周记录</div>
            <div class="tr-stat-number">${this.getWeekRecordCount()}</div>
            <div class="tr-stat-description">最近7天</div>
          </div>
        </div>
        <div class="tr-dashboard-stat" onclick="window.trPlugin.filterDashboardByDate('month')">
          <div class="tr-stat-container">
            <div class="tr-stat-title">本月记录</div>
            <div class="tr-stat-number">${this.getMonthRecordCount()}</div>
            <div class="tr-stat-description">最近30天</div>
          </div>
        </div>
      </div>
    `;

    const typesContainer = document.createElement('div');
    typesContainer.className = 'tr-dashboard-types';
    typesContainer.innerHTML = `
      <div class="tr-dashboard-label">
        <span>🏷️</span>
        <span>活动类型</span>
      </div>
      <div class="tr-type-tags-container">
        <div class="tr-type-tags-header">
          <span>类型分布</span>
          <span>${this.dashboardData.totalCount} 条</span>
        </div>
        <div class="tr-type-tags-list" id="tr-type-tags-list">
    `;

    const sortedTypes = Object.entries(this.dashboardData.typeStats || {})
      .sort((a, b) => b[1].count - a[1].count);

    sortedTypes.forEach(([type, stat]) => {
      const color = stat.color || '#4C6EF5';
      const icon = stat.icon || '📝';
      const [r, g, b] = this.hexToRgb(color);
      typesContainer.innerHTML += `
        <div class="tr-type-tag-item ${this.selectedDashboardType === type ? 'active' : ''}" 
             onclick="window.trPlugin.filterDashboardByType('${type}')" 
             style="border-color: rgba(${r}, ${g}, ${b}, 0.2);">
          <div class="tr-type-tag-dot" style="background: ${color};"></div>
          <div class="tr-type-tag-content">
            <div class="tr-type-tag-name">${icon} ${type}</div>
            <div class="tr-type-tag-stats">
              <div class="tr-type-tag-count">${stat.count}</div>
              <div class="tr-type-tag-percent">${stat.percent}%</div>
            </div>
          </div>
        </div>
      `;
    });

    typesContainer.innerHTML += `
        <div class="tr-type-tag-item all-types ${this.selectedDashboardType === 'all' ? 'active' : ''}" onclick="window.trPlugin.filterDashboardByType('all')">
          <div class="tr-type-tag-dot"></div>
          <div class="tr-type-tag-content">
            <div class="tr-type-tag-name">📊 全部类型</div>
            <div class="tr-type-tag-stats">
              <div class="tr-type-tag-count">${this.dashboardData.totalCount}</div>
              <div class="tr-type-tag-percent">100%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    `;
    panel.appendChild(typesContainer);

    const chart = document.createElement('div');
    chart.className = 'tr-dashboard-chart';
    chart.innerHTML = `
      <div class="tr-chart-label">
        <span>📊</span>
        <span>类型分布</span>
      </div>
      <div class="tr-chart-container">
        <div class="tr-pie-chart-container">
          <svg class="tr-pie-chart-svg" id="tr-pie-chart-svg" viewBox="0 0 100 100">
          </svg>
          <div class="tr-pie-chart-center">
            <div class="tr-pie-label">${this.dashboardData.totalCount}</div>
          </div>
          <div class="tr-pie-tooltip" id="tr-pie-tooltip"></div>
        </div>
        <div class="tr-chart-legend" id="tr-chart-legend"></div>
      </div>
    `;
    panel.appendChild(chart);

    setTimeout(() => {
      this.renderPieChart();
      this.renderChartLegend();
      this.setupPieChartHover();
    }, 10);

    return panel;
  }

  createDashboardTimeline() {
    const timeline = document.createElement('div');
    timeline.className = 'tr-floating-timeline';
    timeline.innerHTML = `
      <div class="tr-timeline-header">
        <div class="tr-timeline-title">
          <span>📅</span>
          <span>时间线记录</span>
        </div>
        <div class="tr-timeline-controls">
          <button class="tr-time-filter ${this.selectedDashboardFilter === 'today' ? 'active' : ''}" onclick="window.trPlugin.filterDashboardByDate('today')">今天</button>
          <button class="tr-time-filter ${this.selectedDashboardFilter === 'week' ? 'active' : ''}" onclick="window.trPlugin.filterDashboardByDate('week')">本周</button>
          <button class="tr-time-filter ${this.selectedDashboardFilter === 'month' ? 'active' : ''}" onclick="window.trPlugin.filterDashboardByDate('month')">本月</button>
          <button class="tr-time-filter ${this.selectedDashboardFilter === 'all' ? 'active' : ''}" onclick="window.trPlugin.filterDashboardByDate('all')">全部</button>
        </div>
      </div>
      <div class="tr-timeline-scroll" id="tr-timeline-scroll"></div>
    `;

    setTimeout(() => {
      this.renderDashboardTimelineContent();
    }, 10);

    return timeline;
  }

  renderDashboardTimelineContent() {
    const timelineScroll = document.getElementById('tr-timeline-scroll');
    if (!timelineScroll || !this.dashboardData) return;

    let filteredDates = this.dashboardData.sortedDates || [];

    if (this.selectedDashboardType !== 'all') {
      filteredDates = filteredDates.filter(date => {
        const records = this.dashboardData.recordsByDate[date];
        return records.some(record => record.type === this.selectedDashboardType);
      });
    }

    if (this.selectedDashboardFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      filteredDates = filteredDates.filter(date => {
        const recordDate = new Date(date);
        switch(this.selectedDashboardFilter) {
          case 'today':
            return recordDate.toDateString() === today.toDateString();
          case 'week':
            const weekAgo = new Date(today);
            weekAgo.setDate(today.getDate() - 7);
            return recordDate >= weekAgo;
          case 'month':
            const monthAgo = new Date(today);
            monthAgo.setMonth(today.getMonth() - 1);
            return recordDate >= monthAgo;
          default:
            return true;
        }
      });
    }

    if (filteredDates.length === 0) {
      timelineScroll.innerHTML = `
        <div class="tr-timeline-empty">
          <div class="tr-empty-symbol">📝</div>
          <div class="tr-empty-message">没有找到相关记录</div>
        </div>
      `;
      return;
    }

    let html = '';
    filteredDates.forEach(date => {
      const records = this.dashboardData.recordsByDate[date].filter(record => {
        return this.selectedDashboardType === 'all' || record.type === this.selectedDashboardType;
      });
      if (records.length === 0) return;
      const dateStr = this.formatDate(new Date(date), 'YYYY年MM月DD日');
      html += `
        <div class="tr-date-group">
          <div class="tr-date-header">
            <div class="tr-date-title">${dateStr}</div>
            <div class="tr-date-badge">${records.length} 条</div>
          </div>
          <div class="tr-time-items">
      `;
      records.forEach(record => {
        const typeStat = this.dashboardData.typeStats[record.type];
        const color = typeStat?.color || '#4C6EF5';
        const icon = typeStat?.icon || '📝';
        const [r, g, b] = this.hexToRgb(color);
        const displayTime = record.dateTime || `${record.date} ${record.time}`;
        html += `
          <div class="tr-time-item" style="border-left-color: ${color};">
            <div class="tr-item-content">${record.content || '无内容'}</div>
            <div class="tr-item-footer">
              <div class="tr-item-date">
                <span>📅</span>
                <span>${displayTime}</span>
              </div>
              <div class="tr-item-type" style="background: rgba(${r}, ${g}, ${b}, 0.1); color: ${color};">
                ${icon} ${record.type}
              </div>
            </div>
          </div>
        `;
      });
      html += `
          </div>
        </div>
      `;
    });
    timelineScroll.innerHTML = html;
  }

  renderPieChart() {
    const svg = document.getElementById('tr-pie-chart-svg');
    const tooltip = document.getElementById('tr-pie-tooltip');
    
    if (!svg || !this.dashboardData) return;
    
    const typeStats = this.dashboardData.typeStats || {};
    const total = this.dashboardData.totalCount || 0;

    if (Object.keys(typeStats).length === 0 || total === 0) {
      svg.innerHTML = `
        <circle cx="50" cy="50" r="40" fill="#f0f0f0" stroke="#ddd" stroke-width="2"/>
        <text x="50" y="50" text-anchor="middle" dominant-baseline="middle" fill="#999" font-size="12">暂无数据</text>
      `;
      return;
    }

    svg.innerHTML = '';

    const sortedTypes = Object.entries(typeStats)
      .sort((a, b) => b[1].count - a[1].count);

    let startAngle = 0;
    sortedTypes.forEach(([type, stat]) => {
      const percentage = stat.count / total;
      const angle = percentage * 360;
      if (percentage > 0) {
        const endAngle = startAngle + angle;
        const startRad = (startAngle - 90) * Math.PI / 180;
        const endRad = (endAngle - 90) * Math.PI / 180;
        const startX = 50 + 40 * Math.cos(startRad);
        const startY = 50 + 40 * Math.sin(startRad);
        const endX = 50 + 40 * Math.cos(endRad);
        const endY = 50 + 40 * Math.sin(endRad);
        const largeArcFlag = angle > 180 ? 1 : 0;
        const pathData = [
          `M 50 50`,
          `L ${startX} ${startY}`,
          `A 40 40 0 ${largeArcFlag} 1 ${endX} ${endY}`,
          `Z`
        ].join(' ');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('fill', stat.color || '#4C6EF5');
        path.setAttribute('stroke', 'white');
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('class', 'tr-pie-slice');
        path.setAttribute('data-type', type);
        path.setAttribute('data-count', stat.count);
        path.setAttribute('data-percent', stat.percent || '0.0');
        path.setAttribute('data-color', stat.color || '#4C6EF5');
        path.setAttribute('data-icon', stat.icon || '📝');

        const gradientId = `tr-gradient-${type.replace(/\s+/g, '-')}`;
        const defs = svg.querySelector('defs') || (() => {
          const d = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
          svg.appendChild(d);
          return d;
        })();
        const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        gradient.setAttribute('id', gradientId);
        gradient.setAttribute('x1', '0%');
        gradient.setAttribute('y1', '0%');
        gradient.setAttribute('x2', '100%');
        gradient.setAttribute('y2', '100%');
        const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', stat.color || '#4C6EF5');
        stop1.setAttribute('stop-opacity', '1');
        const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop2.setAttribute('offset', '100%');
        stop2.setAttribute('stop-color', stat.color || '#4C6EF5');
        stop2.setAttribute('stop-opacity', '0.8');
        gradient.appendChild(stop1);
        gradient.appendChild(stop2);
        defs.appendChild(gradient);
        path.setAttribute('fill', `url(#${gradientId})`);
        svg.appendChild(path);
        startAngle = endAngle;
      }
    });
  }

  setupPieChartHover() {
    const svg = document.getElementById('tr-pie-chart-svg');
    const tooltip = document.getElementById('tr-pie-tooltip');
    const pieCenter = document.querySelector('.tr-pie-chart-center');
    const pieLabel = document.querySelector('.tr-pie-label');
    if (!svg || !tooltip || !pieCenter) return;

    const slices = svg.querySelectorAll('.tr-pie-slice');
    slices.forEach(slice => {
      slice.addEventListener('mouseenter', (e) => {
        const type = slice.getAttribute('data-type');
        const count = slice.getAttribute('data-count');
        const percent = slice.getAttribute('data-percent');
        const color = slice.getAttribute('data-color');
        const icon = slice.getAttribute('data-icon') || '📝';

        tooltip.innerHTML = `
          <div style="display: flex; align-items: center; gap: 6px;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${color};"></div>
            <div style="font-weight: 700;">${icon} ${type}</div>
          </div>
          <div style="margin-top: 4px; font-size: 11px;">
            <div>${count} 条记录</div>
            <div>${percent}%</div>
          </div>
        `;
        tooltip.style.opacity = '1';
        tooltip.style.left = '50%';
        tooltip.style.top = '0';
        slice.style.filter = 'brightness(1.15)';
        slice.style.transform = 'scale(1.02)';
        if (pieLabel) {
          pieLabel.textContent = count;
          pieLabel.style.color = color;
          pieLabel.style.fontSize = '20px';
          pieLabel.style.transition = 'all 0.3s ease';
        }
        this.highlightLegendItem(type);
      });

      slice.addEventListener('mousemove', (e) => {
        const rect = svg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
      });

      slice.addEventListener('mouseleave', () => {
        tooltip.style.opacity = '0';
        slice.style.filter = '';
        slice.style.transform = '';
        if (pieLabel) {
          pieLabel.textContent = this.dashboardData.totalCount;
          pieLabel.style.color = '#2C3E50';
          pieLabel.style.fontSize = '18px';
        }
        this.resetLegendHighlight();
      });

      slice.addEventListener('click', () => {
        const type = slice.getAttribute('data-type');
        this.filterDashboardByType(type);
      });
    });
  }

  highlightLegendItem(type) {
    const legendItems = document.querySelectorAll('.tr-legend-item');
    legendItems.forEach(item => {
      const legendText = item.querySelector('.tr-legend-text');
      if (legendText && legendText.textContent.includes(type)) {
        item.style.transform = 'translateX(4px)';
        item.style.color = '#2C3E50';
        item.style.fontWeight = '700';
        const legendColor = item.querySelector('.tr-legend-color');
        if (legendColor) {
          legendColor.style.transform = 'scale(1.2)';
        }
      }
    });
  }

  resetLegendHighlight() {
    const legendItems = document.querySelectorAll('.tr-legend-item');
    legendItems.forEach(item => {
      item.style.transform = '';
      item.style.color = '';
      item.style.fontWeight = '';
      const legendColor = item.querySelector('.tr-legend-color');
      if (legendColor) {
        legendColor.style.transform = '';
      }
    });
  }

  renderChartLegend() {
    const legendContainer = document.getElementById('tr-chart-legend');
    if (!legendContainer || !this.dashboardData) return;

    const typeStats = this.dashboardData.typeStats || {};
    const total = this.dashboardData.totalCount || 0;

    let html = '';
    let index = 0;

    const sortedTypes = Object.entries(typeStats)
      .sort((a, b) => b[1].count - a[1].count);

    sortedTypes.forEach(([type, stat]) => {
      const percentage = total > 0 ? Math.round((stat.count / total) * 100) : 0;
      html += `
        <div class="tr-legend-item" onclick="window.trPlugin.filterDashboardByType('${type}')" data-type="${type}">
          <div class="tr-legend-color" style="background: ${stat.color || '#4C6EF5'};"></div>
          <div class="tr-legend-text">${stat.icon || '📝'} ${type}</div>
          <div style="color: #6C757D; font-weight: 600; font-size: 10px;">${percentage}%</div>
        </div>
      `;
      index++;
    });
    legendContainer.innerHTML = html;
  }

  filterDashboardByType(type) {
    this.selectedDashboardType = type;
    this.renderDashboardTimelineContent();
    this.updateDashboardTypeSelection();
  }

  filterDashboardByDate(dateFilter) {
    this.selectedDashboardFilter = dateFilter;
    this.renderDashboardTimelineContent();
    this.updateDashboardFilterSelection();
  }

  updateDashboardTypeSelection() {
    const statCards = document.querySelectorAll('.tr-dashboard-stat');
    statCards.forEach(card => {
      card.classList.remove('active');
    });
    if (this.selectedDashboardType === 'all') {
      const firstCard = document.querySelector('.tr-dashboard-stat:first-child');
      if (firstCard) firstCard.classList.add('active');
    }

    const typeTags = document.querySelectorAll('.tr-type-tag-item');
    typeTags.forEach(tag => {
      tag.classList.remove('active');
      const typeNameElement = tag.querySelector('.tr-type-tag-name');
      if (typeNameElement) {
        const typeText = typeNameElement.textContent.trim();
        if (this.selectedDashboardType === 'all' && typeText === '📊 全部类型') {
          tag.classList.add('active');
        } else if (typeText.includes(this.selectedDashboardType)) {
          tag.classList.add('active');
        }
      }
    });

    const pieLabel = document.querySelector('.tr-pie-label');
    if (pieLabel && this.dashboardData) {
      if (this.selectedDashboardType === 'all') {
        pieLabel.textContent = this.dashboardData.totalCount;
        pieLabel.style.color = '#2C3E50';
      } else {
        const typeStat = this.dashboardData.typeStats[this.selectedDashboardType];
        if (typeStat) {
          pieLabel.textContent = typeStat.count;
          pieLabel.style.color = typeStat.color || '#2C3E50';
        }
      }
    }
  }

  updateDashboardFilterSelection() {
    const filterButtons = document.querySelectorAll('.tr-time-filter');
    filterButtons.forEach(btn => {
      btn.classList.remove('active');
      const filterText = btn.textContent;
      const filterMap = {
        '今天': 'today',
        '本周': 'week',
        '本月': 'month',
        '全部': 'all'
      };
      if (filterMap[filterText] === this.selectedDashboardFilter) {
        btn.classList.add('active');
      }
    });
  }

  formatDate(date, format = 'YYYY-MM-DD') {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    if (format === 'YYYY-MM-DD') {
      return `${year}-${month}-${day}`;
    } else if (format === 'MM/DD') {
      return `${month}/${day}`;
    } else if (format === 'YYYY年MM月DD日') {
      return `${year}年${month}月${day}日`;
    } else if (format === 'MM-DD') {
      return `${month}-${day}`;
    } else if (format === 'HH:mm') {
      return `${hours}:${minutes}`;
    } else if (format === 'YYYY-MM-DD HH:mm') {
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    }
    return `${year}-${month}-${day}`;
  }

  getTypeColor(type) {
    try {
      const tempElement = document.createElement('div');
      tempElement.style.display = 'none';
      tempElement.setAttribute('data-type', 'NodeParagraph');
      tempElement.setAttribute('custom-lifelog-type', type);
      document.documentElement.appendChild(tempElement);
      
      const computedStyle = getComputedStyle(tempElement);
      const color = computedStyle.getPropertyValue('--en-lifelog-border-color').trim();
      
      document.documentElement.removeChild(tempElement);
      
      if (color && color !== '') {
        return color;
      }
    } catch (error) {
      console.warn(`无法获取类型 "${type}" 的颜色:`, error);
    }
    
    const defaultColors = {
      '记录': '#4C6EF5',
      '工作': '#40C057',
      '学习': '#228BE6',
      '娱乐': '#FA5252',
      '打卡': '#FAB005',
      '轻语': '#7950F2'
    };
    
    return defaultColors[type] || '#4C6EF5';
  }

  getTypeIcon(type) {
    const defaultIcons = {
      '记录': '📝',
      '工作': '💼',
      '学习': '📚',
      '娱乐': '🎮',
      '打卡': '✅',
      '轻语': '💬'
    };
    
    return defaultIcons[type] || '📝';
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : [76, 110, 245];
  }

  lightenColor(color, percent) {
    const [r, g, b] = this.hexToRgb(color);
    const lighten = (c) => Math.min(255, c + (255 - c) * (percent / 100));
    return `rgb(${lighten(r)}, ${lighten(g)}, ${lighten(b)})`;
  }

  getTodayRecordCount() {
    if (!this.dashboardData) return 0;
    const today = this.formatDate(new Date(), 'YYYY-MM-DD');
    return this.dashboardData.recordsByDate[today]?.length || 0;
  }

  getWeekRecordCount() {
    if (!this.dashboardData) return 0;
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    
    let count = 0;
    Object.keys(this.dashboardData.recordsByDate).forEach(date => {
      const recordDate = new Date(date);
      if (recordDate >= weekAgo) {
        count += this.dashboardData.recordsByDate[date].length;
      }
    });
    return count;
  }

  getMonthRecordCount() {
    if (!this.dashboardData) return 0;
    const now = new Date();
    const monthAgo = new Date(now);
    monthAgo.setMonth(now.getMonth() - 1);
    
    let count = 0;
    Object.keys(this.dashboardData.recordsByDate).forEach(date => {
      const recordDate = new Date(date);
      if (recordDate >= monthAgo) {
        count += this.dashboardData.recordsByDate[date].length;
      }
    });
    return count;
  }

  async reloadDashboard() {
    if (this.dashboardInstance) {
      this.dashboardInstance.innerHTML = `
        <div class="tr-floating-decoration"></div>
        <div class="tr-floating-loading" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: calc(100% - 3px);">
          <div style="width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid #4C6EF5; border-radius: 50%; animation: tr-spin 1s linear infinite; margin-bottom: 16px;"></div>
          <div style="font-size: 14px; color: #495057; font-weight: 600;">正在重新加载...</div>
        </div>
        <style>
          @keyframes tr-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        </style>
      `;
      await this.loadDashboardData();
    }
  }

  closeDashboard() {
    if (this.dashboardInstance) {
      this.dashboardInstance.style.animation = 'none';
      this.dashboardInstance.style.opacity = '0';
      this.dashboardInstance.style.transform = 'translate(-50%, -50%) scale(0.95)';
      setTimeout(() => {
        if (this.dashboardInstance && this.dashboardInstance.parentNode) {
          this.dashboardInstance.parentNode.removeChild(this.dashboardInstance);
        }
        this.dashboardInstance = null;
      }, 300);
    }
    if (this.dashboardOverlay) {
      this.dashboardOverlay.style.opacity = '0';
      setTimeout(() => {
        if (this.dashboardOverlay && this.dashboardOverlay.parentNode) {
          this.dashboardOverlay.parentNode.removeChild(this.dashboardOverlay);
        }
        this.dashboardOverlay = null;
      }, 300);
    }
  }

  // ============ 统计面板功能 ============

  async openStatsModal() {
    if (this.statsModalInstance) {
      this.closeStatsModal();
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'time-record-stats-modal';
    overlay.id = 'time-record-stats-modal';

    const container = document.createElement('div');
    container.className = 'time-record-stats-container';

    const header = this.createStatsModalHeader();
    container.appendChild(header);

    const grid = this.createStatsGrid();
    container.appendChild(grid);

    overlay.appendChild(container);
    document.body.appendChild(overlay);

    this.statsModalInstance = overlay;

    await this.loadStatsData();
    this.renderStatsCharts();
  }

  createStatsModalHeader() {
    const header = document.createElement('div');
    header.className = 'stats-modal-header';
    
    header.innerHTML = `
      <div class="stats-modal-title">
        <div class="stats-modal-icon">📈</div>
        <div>
          <h3>统计图表分析</h3>
          <div class="stats-modal-subtitle">
            <span>四维度图表展示</span>
            <span>·</span>
            <span>数据实时更新</span>
          </div>
        </div>
      </div>
      <button class="stats-modal-close" title="关闭">×</button>
    `;

    const closeBtn = header.querySelector('.stats-modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeStatsModal());
    }

    return header;
  }

  createStatsGrid() {
    const grid = document.createElement('div');
    grid.className = 'stats-grid-container';
    
    const charts = [
      { id: 1, title: '类型分布', icon: '🏷️', description: '按类型统计的记录数量', type: 'bar', color: '#4C6EF5' },
      { id: 2, title: '时间趋势', icon: '📈', description: '最近30天记录趋势', type: 'line', color: '#40C057' },
      { id: 3, title: '记录占比', icon: '📊', description: '各类记录占比分析', type: 'pie', color: '#FAB005' },
      { id: 4, title: '时段分布', icon: '⏰', description: '按小时统计记录分布', type: 'hour-line', color: '#FA5252' }
    ];

    charts.forEach(chart => {
      const card = document.createElement('div');
      card.className = 'stats-chart-card';
      card.id = `stats-chart-${chart.id}`;
      
      card.innerHTML = `
        <div class="chart-header">
          <div class="chart-title">
            <div class="chart-icon" style="background: linear-gradient(135deg, ${chart.color}, ${this.lightenColor(chart.color, 20)});">
              ${chart.icon}
            </div>
            <div class="chart-text">
              <h4>${chart.title}</h4>
              <p>${chart.description}</p>
            </div>
          </div>
          <div class="chart-meta">
            <div class="chart-value">0</div>
            <div class="chart-trend trend-neutral">
              <span>↗️</span>
              <span>0%</span>
            </div>
          </div>
        </div>
        <div class="chart-content">
          <div class="chart-loading">加载图表...</div>
        </div>
        <div class="chart-legend"></div>
      `;
      
      grid.appendChild(card);
    });

    return grid;
  }

  async loadStatsData() {
    try {
      const sql = `
        SELECT
          b.id,
          b.content,
          b.created,
          b.updated,
          a1.value as lifelog_created,
          a2.value as lifelog_type
        FROM blocks b
        LEFT JOIN attributes a1 ON b.id = a1.block_id AND a1.name = 'custom-lifelog-created'
        LEFT JOIN attributes a2 ON b.id = a2.block_id AND a2.name = 'custom-lifelog-type'
        WHERE
          b.type = 'p'
          AND a1.value IS NOT NULL
          AND a2.value IS NOT NULL
          AND b.hpath NOT LIKE '%template%'
        ORDER BY a1.value DESC
        LIMIT 1000
      `;
      
      const records = await this.executeSQL(sql);
      this.statsData = this.processStatsData(records);
    } catch (error) {
      console.error('加载统计数据失败:', error);
      this.statsData = null;
    }
  }

  processStatsData(records) {
    const result = {
      typeDistribution: {},
      dailyTrend: {},
      hourDistribution: {},
      typePercentages: {},
      total: records.length
    };

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    records.forEach(record => {
      if (!record.lifelog_created) return;
      
      // 解析日期和时间
      const dateMatch = record.lifelog_created.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
      const timeMatch = record.lifelog_created.match(/(\d{1,2}):(\d{1,2})/);
      
      if (!dateMatch) return;
      
      const [_, year, month, day] = dateMatch;
      const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      const recordDate = new Date(year, parseInt(month) - 1, day);
      
      // 类型分布
      const type = record.lifelog_type || '未分类';
      if (!result.typeDistribution[type]) {
        result.typeDistribution[type] = 0;
      }
      result.typeDistribution[type]++;
      
      // 日期趋势（最近30天）
      if (recordDate >= thirtyDaysAgo) {
        if (!result.dailyTrend[dateStr]) {
          result.dailyTrend[dateStr] = 0;
        }
        result.dailyTrend[dateStr]++;
      }
      
      // 小时分布（24小时制）
      if (timeMatch) {
        let hour = parseInt(timeMatch[1]);
        hour = hour % 24;
        if (!result.hourDistribution[hour]) {
          result.hourDistribution[hour] = 0;
        }
        result.hourDistribution[hour]++;
      }
    });

    // 计算百分比
    Object.keys(result.typeDistribution).forEach(type => {
      result.typePercentages[type] = (result.typeDistribution[type] / result.total * 100).toFixed(1);
    });

    return result;
  }

  renderStatsCharts() {
    if (!this.statsData) {
      this.showChartError('数据加载失败');
      return;
    }

    // 渲染柱状图（类型分布）
    this.renderBarChart();
    
    // 渲染折线图（时间趋势）
    this.renderLineChart();
    
    // 渲染饼图（记录占比）
    this.renderPieChart();
    
    // 渲染时段分布折线图
    this.renderHourLineChart();
  }

  renderBarChart() {
    const chartCard = document.getElementById('stats-chart-1');
    if (!chartCard || !this.statsData.typeDistribution) return;

    const typeData = Object.entries(this.statsData.typeDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    if (typeData.length === 0) {
      chartCard.querySelector('.chart-content').innerHTML = `
        <div class="chart-empty">
          <p>暂无类型数据</p>
        </div>
      `;
      return;
    }

    const maxValue = Math.max(...typeData.map(item => item[1]));
    const total = typeData.reduce((sum, item) => sum + item[1], 0);

    const chartContent = chartCard.querySelector('.chart-content');
    chartContent.innerHTML = `
      <div class="bar-chart-container">
        <div class="bar-chart-bars">
          ${typeData.map(([type, count], index) => {
            const height = maxValue > 0 ? (count / maxValue * 100) : 0;
            const color = this.getTypeColor(type);
            const lightColor = this.lightenColor(color, 30);
            return `
              <div class="bar-chart-bar" 
                   style="--bar-color: ${color}; --bar-color-light: ${lightColor}; height: ${height}%"
                   data-type="${type}"
                   data-count="${count}">
                <div class="bar-chart-value">${count}</div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="bar-chart-labels">
          ${typeData.map(([type, count]) => `
            <div class="bar-chart-label" title="${type}">${type}</div>
          `).join('')}
        </div>
      </div>
    `;

    // 更新数值
    const chartValue = chartCard.querySelector('.chart-value');
    const chartTrend = chartCard.querySelector('.chart-trend');
    if (chartValue) chartValue.textContent = total;
    if (chartTrend) {
      chartTrend.innerHTML = `<span>↗️</span><span>${typeData.length}类</span>`;
      chartTrend.className = 'chart-trend trend-up';
    }

    // 添加图例
    const legend = chartCard.querySelector('.chart-legend');
    if (legend) {
      legend.innerHTML = typeData.map(([type, count]) => `
        <div class="legend-item" data-type="${type}">
          <div class="legend-color" style="background: ${this.getTypeColor(type)};"></div>
          <span>${type}: ${count}</span>
        </div>
      `).join('');
    }

    // 添加悬停效果
    this.setupBarChartHover();
  }

  renderLineChart() {
    const chartCard = document.getElementById('stats-chart-2');
    if (!chartCard || !this.statsData.dailyTrend) return;

    const dailyData = Object.entries(this.statsData.dailyTrend)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-15);

    if (dailyData.length === 0) {
      chartCard.querySelector('.chart-content').innerHTML = `
        <div class="chart-empty">
          <p>暂无最近30天数据</p>
        </div>
      `;
      return;
    }

    const dates = dailyData.map(item => {
      const date = new Date(item[0]);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    });
    const values = dailyData.map(item => item[1]);
    const maxValue = Math.max(...values);
    const total = values.reduce((sum, val) => sum + val, 0);

    // 计算趋势
    let trend = 0;
    if (values.length > 1) {
      const firstValue = values[0] || 0;
      const lastValue = values[values.length - 1] || 0;
      trend = firstValue > 0 ? ((lastValue - firstValue) / firstValue * 100) : lastValue > 0 ? 100 : 0;
    }

    const svgWidth = 400;
    const svgHeight = 200;
    const padding = { top: 20, right: 20, bottom: 30, left: 40 };

    const xScale = (i) => padding.left + (i * (svgWidth - padding.left - padding.right) / (dates.length - 1));
    const yScale = (value) => svgHeight - padding.bottom - ((value / maxValue) * (svgHeight - padding.top - padding.bottom));

    let pathData = '';
    values.forEach((value, i) => {
      const x = xScale(i);
      const y = yScale(value);
      if (i === 0) {
        pathData += `M ${x} ${y} `;
      } else {
        pathData += `L ${x} ${y} `;
      }
    });

    let areaData = pathData;
    areaData += `L ${xScale(values.length - 1)} ${svgHeight - padding.bottom} `;
    areaData += `L ${padding.left} ${svgHeight - padding.bottom} Z`;

    const chartContent = chartCard.querySelector('.chart-content');
    chartContent.innerHTML = `
      <svg class="line-chart-svg" viewBox="0 0 ${svgWidth} ${svgHeight}">
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#40C057" stop-opacity="0.4" />
            <stop offset="100%" stop-color="#40C057" stop-opacity="0.1" />
          </linearGradient>
        </defs>
        
        <!-- 网格线 -->
        <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${svgHeight - padding.bottom}" class="chart-axis-line" />
        <line x1="${padding.left}" y1="${svgHeight - padding.bottom}" x2="${svgWidth - padding.right}" y2="${svgHeight - padding.bottom}" class="chart-axis-line" />
        
        <!-- 区域填充 -->
        <path class="line-chart-area" d="${areaData}" />
        
        <!-- 折线 -->
        <path class="line-chart-line" d="${pathData}" style="--line-color: #40C057;" />
        
        <!-- 数据点 -->
        ${values.map((value, i) => {
          const x = xScale(i);
          const y = yScale(value);
          return `<circle class="line-chart-point" cx="${x}" cy="${y}" r="3" style="--line-color: #40C057;" data-date="${dates[i]}" data-value="${value}" />`;
        }).join('')}
        
        <!-- X轴标签 -->
        ${dates.map((date, i) => {
          const x = xScale(i);
          return `<text x="${x}" y="${svgHeight - 10}" text-anchor="middle" font-size="10" fill="#6C757D" class="time-label">${date}</text>`;
        }).join('')}
        
        <!-- Y轴标签 -->
        ${[0, Math.floor(maxValue/2), maxValue].map((value, i) => {
          const y = yScale(value);
          return `<text x="${padding.left - 5}" y="${y}" text-anchor="end" font-size="10" fill="#6C757D" dy="0.3em">${value}</text>`;
        }).join('')}
      </svg>
    `;

    // 更新数值
    const chartValue = chartCard.querySelector('.chart-value');
    const chartTrend = chartCard.querySelector('.chart-trend');
    if (chartValue) chartValue.textContent = total;
    if (chartTrend) {
      const trendClass = trend > 0 ? 'trend-up' : trend < 0 ? 'trend-down' : 'trend-neutral';
      const trendIcon = trend > 0 ? '↗️' : trend < 0 ? '↘️' : '→';
      chartTrend.innerHTML = `<span>${trendIcon}</span><span>${Math.abs(trend).toFixed(1)}%</span>`;
      chartTrend.className = `chart-trend ${trendClass}`;
    }

    // 添加悬停效果
    this.setupLineChartHover();
  }

  renderPieChart() {
    const chartCard = document.getElementById('stats-chart-3');
    if (!chartCard || !this.statsData.typeDistribution) return;

    const typeData = Object.entries(this.statsData.typeDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const total = typeData.reduce((sum, item) => sum + item[1], 0);
    const otherTypes = this.statsData.total - total;

    if (otherTypes > 0) {
      typeData.push(['其他', otherTypes]);
    }

    if (typeData.length === 0) {
      chartCard.querySelector('.chart-content').innerHTML = `
        <div class="chart-empty">
          <p>暂无类型数据</p>
        </div>
      `;
      return;
    }

    const chartContent = chartCard.querySelector('.chart-content');
    chartContent.innerHTML = `
      <div class="pie-chart-container">
        <svg class="pie-chart-svg" viewBox="0 0 100 100">
          ${this.createPieSlices(typeData)}
        </svg>
        <div class="pie-chart-center">
          <div class="center-value">${this.statsData.total}</div>
          <div class="center-label">总记录</div>
        </div>
      </div>
    `;

    // 更新数值
    const chartValue = chartCard.querySelector('.chart-value');
    const chartTrend = chartCard.querySelector('.chart-trend');
    if (chartValue) chartValue.textContent = this.statsData.total;
    if (chartTrend) {
      chartTrend.innerHTML = `<span>📊</span><span>${typeData.length}类</span>`;
      chartTrend.className = 'chart-trend trend-neutral';
    }

    // 添加图例
    const legend = chartCard.querySelector('.chart-legend');
    if (legend) {
      legend.innerHTML = typeData.map(([type, count]) => {
        const percentage = ((count / this.statsData.total) * 100).toFixed(1);
        const color = type === '其他' ? '#6C757D' : this.getTypeColor(type);
        return `
          <div class="legend-item" data-type="${type}">
            <div class="legend-color" style="background: ${color};"></div>
            <span>${type}: ${percentage}%</span>
          </div>
        `;
      }).join('');
    }

    // 添加悬停效果
    this.setupPieChartHover();
  }

  createPieSlices(typeData) {
    let startAngle = 0;
    const total = typeData.reduce((sum, item) => sum + item[1], 0);
    
    return typeData.map(([type, count], index) => {
      const percentage = count / total;
      const angle = percentage * 360;
      const endAngle = startAngle + angle;
      
      const startRad = (startAngle - 90) * Math.PI / 180;
      const endRad = (endAngle - 90) * Math.PI / 180;
      
      const startX = 50 + 40 * Math.cos(startRad);
      const startY = 50 + 40 * Math.sin(startRad);
      const endX = 50 + 40 * Math.cos(endRad);
      const endY = 50 + 40 * Math.sin(endRad);
      
      const largeArcFlag = angle > 180 ? 1 : 0;
      
      const pathData = [
        `M 50 50`,
        `L ${startX} ${startY}`,
        `A 40 40 0 ${largeArcFlag} 1 ${endX} ${endY}`,
        `Z`
      ].join(' ');
      
      const color = type === '其他' ? '#6C757D' : this.getTypeColor(type);
      
      startAngle = endAngle;
      
      return `<path d="${pathData}" fill="${color}" stroke="white" stroke-width="1.5" 
                     data-type="${type}" data-count="${count}" data-percent="${(percentage * 100).toFixed(1)}" />`;
    }).join('');
  }

  renderHourLineChart() {
    const chartCard = document.getElementById('stats-chart-4');
    if (!chartCard || !this.statsData.hourDistribution) return;

    // 获取24小时的数据
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const values = hours.map(hour => this.statsData.hourDistribution[hour] || 0);
    const maxValue = Math.max(...values, 1);
    const total = values.reduce((sum, val) => sum + val, 0);
    const activeHours = values.filter(v => v > 0).length;

    // 格式化小时标签
    const hourLabels = hours.map(hour => {
      if (hour === 0) return '00:00';
      if (hour === 12) return '12:00';
      if (hour === 23) return '23:00';
      if (hour % 6 === 0) return `${hour}:00`;
      return '';
    });

    const svgWidth = 400;
    const svgHeight = 200;
    const padding = { top: 20, right: 20, bottom: 30, left: 40 };

    const xScale = (i) => padding.left + (i * (svgWidth - padding.left - padding.right) / (hours.length - 1));
    const yScale = (value) => svgHeight - padding.bottom - ((value / maxValue) * (svgHeight - padding.top - padding.bottom));

    let pathData = '';
    values.forEach((value, i) => {
      const x = xScale(i);
      const y = yScale(value);
      if (i === 0) {
        pathData += `M ${x} ${y} `;
      } else {
        pathData += `L ${x} ${y} `;
      }
    });

    let areaData = pathData;
    areaData += `L ${xScale(values.length - 1)} ${svgHeight - padding.bottom} `;
    areaData += `L ${padding.left} ${svgHeight - padding.bottom} Z`;

    const chartContent = chartCard.querySelector('.chart-content');
    chartContent.innerHTML = `
      <div class="hour-line-chart-container">
        <svg class="hour-line-chart-svg" viewBox="0 0 ${svgWidth} ${svgHeight}">
          <defs>
            <linearGradient id="hourGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#FA5252" stop-opacity="0.4" />
              <stop offset="100%" stop-color="#FA5252" stop-opacity="0.1" />
            </linearGradient>
          </defs>
          
          <!-- 网格线 -->
          <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${svgHeight - padding.bottom}" class="chart-axis-line" />
          <line x1="${padding.left}" y1="${svgHeight - padding.bottom}" x2="${svgWidth - padding.right}" y2="${svgHeight - padding.bottom}" class="chart-axis-line" />
          
          <!-- 水平网格线 -->
          ${[0, 0.25, 0.5, 0.75, 1].map(ratio => {
            const y = yScale(maxValue * ratio);
            return `<line x1="${padding.left}" y1="${y}" x2="${svgWidth - padding.right}" y2="${y}" class="chart-grid-line" />`;
          }).join('')}
          
          <!-- 区域填充 -->
          <path class="hour-line-chart-area" d="${areaData}" />
          
          <!-- 折线 -->
          <path class="hour-line-chart-line" d="${pathData}" style="--hour-line-color: #FA5252;" />
          
          <!-- 数据点 -->
          ${values.map((value, i) => {
            const x = xScale(i);
            const y = yScale(value);
            if (value > 0) {
              return `<circle class="hour-line-chart-point" cx="${x}" cy="${y}" r="3" style="--hour-line-color: #FA5252;" data-hour="${hours[i]}:00" data-value="${value}" />`;
            }
            return '';
          }).join('')}
          
          <!-- X轴标签（小时） -->
          ${hourLabels.map((label, i) => {
            if (label) {
              const x = xScale(i);
              return `<text x="${x}" y="${svgHeight - 10}" text-anchor="middle" font-size="10" fill="#6C757D" class="time-label">${label}</text>`;
            }
            return '';
          }).join('')}
          
          <!-- Y轴标签 -->
          ${[0, Math.floor(maxValue/2), maxValue].map((value, i) => {
            const y = yScale(value);
            return `<text x="${padding.left - 5}" y="${y}" text-anchor="end" font-size="10" fill="#6C757D" dy="0.3em">${value}</text>`;
          }).join('')}
          
          <!-- 标题 -->
          <text x="${svgWidth / 2}" y="${padding.top - 5}" text-anchor="middle" font-size="12" fill="#495057" font-weight="600">24小时记录分布</text>
        </svg>
      </div>
    `;

    // 更新数值
    const chartValue = chartCard.querySelector('.chart-value');
    const chartTrend = chartCard.querySelector('.chart-trend');
    if (chartValue) chartValue.textContent = total;
    if (chartTrend) {
      chartTrend.innerHTML = `<span>⏰</span><span>${activeHours}时</span>`;
      chartTrend.className = 'chart-trend trend-neutral';
    }

    // 添加悬停效果
    this.setupHourLineChartHover();
  }

  setupBarChartHover() {
    const bars = document.querySelectorAll('.bar-chart-bar');
    const tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    document.body.appendChild(tooltip);

    bars.forEach(bar => {
      bar.addEventListener('mouseenter', (e) => {
        const type = bar.getAttribute('data-type');
        const count = bar.getAttribute('data-count');
        const color = this.getTypeColor(type);
        
        tooltip.innerHTML = `
          <div style="font-weight: 700; color: ${color}">${type}</div>
          <div style="font-size: 11px; margin-top: 4px;">${count} 条记录</div>
        `;
        tooltip.style.opacity = '1';
        
        const rect = bar.getBoundingClientRect();
        tooltip.style.left = `${rect.left + rect.width / 2}px`;
        tooltip.style.top = `${rect.top - 10}px`;
      });

      bar.addEventListener('mousemove', (e) => {
        tooltip.style.left = `${e.clientX}px`;
        tooltip.style.top = `${e.clientY - 40}px`;
      });

      bar.addEventListener('mouseleave', () => {
        tooltip.style.opacity = '0';
      });
    });
  }

  setupLineChartHover() {
    const points = document.querySelectorAll('.line-chart-point');
    const tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    document.body.appendChild(tooltip);

    points.forEach(point => {
      point.addEventListener('mouseenter', (e) => {
        const date = point.getAttribute('data-date');
        const value = point.getAttribute('data-value');
        
        tooltip.innerHTML = `
          <div style="font-weight: 700;">${date}</div>
          <div style="font-size: 11px; margin-top: 4px; color: #40C057;">${value} 条记录</div>
        `;
        tooltip.style.opacity = '1';
      });

      point.addEventListener('mousemove', (e) => {
        tooltip.style.left = `${e.clientX}px`;
        tooltip.style.top = `${e.clientY - 40}px`;
      });

      point.addEventListener('mouseleave', () => {
        tooltip.style.opacity = '0';
      });
    });
  }

  setupPieChartHover() {
    const slices = document.querySelectorAll('.pie-chart-svg path');
    const centerValue = document.querySelector('.center-value');
    const centerLabel = document.querySelector('.center-label');
    const tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    document.body.appendChild(tooltip);

    slices.forEach(slice => {
      slice.addEventListener('mouseenter', (e) => {
        const type = slice.getAttribute('data-type');
        const count = slice.getAttribute('data-count');
        const percent = slice.getAttribute('data-percent');
        const color = type === '其他' ? '#6C757D' : this.getTypeColor(type);
        
        tooltip.innerHTML = `
          <div style="font-weight: 700; color: ${color}">${type}</div>
          <div style="font-size: 11px; margin-top: 4px;">
            <div>${count} 条记录</div>
            <div>${percent}%</div>
          </div>
        `;
        tooltip.style.opacity = '1';
        
        if (centerValue && centerLabel) {
          centerValue.textContent = count;
          centerValue.style.color = color;
          centerLabel.textContent = type;
        }
      });

      slice.addEventListener('mousemove', (e) => {
        tooltip.style.left = `${e.clientX}px`;
        tooltip.style.top = `${e.clientY - 40}px`;
      });

      slice.addEventListener('mouseleave', () => {
        tooltip.style.opacity = '0';
        if (centerValue && centerLabel) {
          centerValue.textContent = this.statsData.total;
          centerValue.style.color = '#2C3E50';
          centerLabel.textContent = '总记录';
        }
      });
    });
  }

  setupHourLineChartHover() {
    const points = document.querySelectorAll('.hour-line-chart-point');
    const tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    document.body.appendChild(tooltip);

    points.forEach(point => {
      point.addEventListener('mouseenter', (e) => {
        const hour = point.getAttribute('data-hour');
        const value = point.getAttribute('data-value');
        
        tooltip.innerHTML = `
          <div style="font-weight: 700;">${hour}</div>
          <div style="font-size: 11px; margin-top: 4px; color: #FA5252;">${value} 条记录</div>
        `;
        tooltip.style.opacity = '1';
      });

      point.addEventListener('mousemove', (e) => {
        tooltip.style.left = `${e.clientX}px`;
        tooltip.style.top = `${e.clientY - 40}px`;
      });

      point.addEventListener('mouseleave', () => {
        tooltip.style.opacity = '0';
      });
    });
  }

  showChartError(message) {
    const chartCards = document.querySelectorAll('.stats-chart-card');
    chartCards.forEach(card => {
      const content = card.querySelector('.chart-content');
      if (content) {
        content.innerHTML = `
          <div class="chart-empty">
            <p>${message}</p>
          </div>
        `;
      }
    });
  }

  closeStatsModal() {
    if (!this.statsModalInstance) return;
    
    const modal = this.statsModalInstance;
    modal.style.opacity = '0';
    
    setTimeout(() => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
      this.statsModalInstance = null;
      this.statsData = null;
    }, 300);
  }

  async onLayoutReady() {
    window.trPlugin = this;
  }

  onunload() {
    if (this.statsModalInstance) {
      this.closeStatsModal();
    }
    
    if (this.dashboardInstance) {
      this.closeDashboard();
    }
    
    if (this.setting) {
      this.setting = null;
    }
    
    if (this.dockInstance) {
      this.dockInstance = null;
    }
    
    if (this.sidebarContainer) {
      this.sidebarContainer.innerHTML = '';
      this.sidebarContainer = null;
    }
    
    this.currentData = [];
    this.discoveredTypes.clear();
    
    if (window.trPlugin === this) {
      window.trPlugin = null;
    }
    
    console.log("时迹插件 已关闭");
  }

  uninstall() {
    this.removeData(STORAGE_NAME).catch(e => {
      showMessage(`uninstall [${this.name}] remove data [${STORAGE_NAME}] fail: ${e.msg}`);
    });
  }
};