const { Plugin, Setting, showMessage } = require("siyuan");

const STORAGE_NAME = "time-record-config.json";

module.exports = class TimeRecordPlugin extends Plugin {
    // 配置
    config = {
        sidebarWidth: '480px',
        author: '恨水长秋',
        location: '倒悬山',
        timeIcon: '📅',    // 新增：时间图标
        authorIcon: '🎨',  // 新增：作者图标
        typeIcon: '📌'     // 新增：类型图标
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
    
    async onload() {
        // 只保留这一个启动日志
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
                // 设置容器样式，确保正常显示
                this.sidebarContainer.style.cssText = `
                    height: 100%;
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                `;
                
                // 初始加载数据
                this.loadTimeRecords();
            },
            show: () => {
                // 当停靠栏被点击显示时，立即刷新数据
                this.loadTimeRecords();
            },
            destroy: () => {}
        });
        
        // 添加设置面板
        this.initSettingPanel();
    }
    
    async loadConfig() {
        this.data[STORAGE_NAME] = this.data[STORAGE_NAME] || {
            author: this.config.author,
            location: this.config.location,
            sidebarWidth: this.config.sidebarWidth,
            timeIcon: this.config.timeIcon,      // 新增
            authorIcon: this.config.authorIcon,  // 新增
            typeIcon: this.config.typeIcon       // 新增
        };
        
        // 合并配置
        Object.assign(this.config, this.data[STORAGE_NAME]);
    }
    
    initSidebar() {
        if (!this.sidebarContainer) return;
        
        this.sidebarContainer.innerHTML = `
            <div class="time-record-container" style="height: 100%; width: 100%;">
                <div class="time-record-header">
                    <h3>⏰ 时间记录</h3>
                    <div class="header-actions">
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
                    <div class="loading-container">
                        <div class="loading-spinner"></div>
                        <p>加载中...</p>
                    </div>
                </div>
                <div class="time-record-footer">
                    <span class="refresh-info">最后更新: <span id="last-refresh-time">刚刚</span></span>
                    <span class="record-count">记录总数: <span id="total-count">0</span></span>
                </div>
            </div>
        `;
        
        // 绑定事件
        this.bindSidebarEvents();
    }
    
    bindSidebarEvents() {
        if (!this.sidebarContainer) return;
        
        // 刷新按钮
        const refreshBtn = this.sidebarContainer.querySelector('.time-record-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadTimeRecords();
            });
        }
        
        // 统计按钮
        const statsBtn = this.sidebarContainer.querySelector('#stats-btn');
        if (statsBtn) {
            statsBtn.addEventListener('click', () => {
                this.showStats = !this.showStats;
                statsBtn.classList.toggle('active', this.showStats);
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
        
        // 类型筛选按钮（"全部"按钮）
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
        
        // 新增：时间图标输入框
        const timeIconInput = document.createElement('input');
        timeIconInput.className = 'b3-text-field fn__block';
        timeIconInput.placeholder = '时间图标，如：📅';
        timeIconInput.value = this.config.timeIcon;
        
        // 新增：作者图标输入框
        const authorIconInput = document.createElement('input');
        authorIconInput.className = 'b3-text-field fn__block';
        authorIconInput.placeholder = '作者图标，如：🎨';
        authorIconInput.value = this.config.authorIcon;
        
        // 新增：类型图标输入框
        const typeIconInput = document.createElement('input');
        typeIconInput.className = 'b3-text-field fn__block';
        typeIconInput.placeholder = '类型图标，如：📌';
        typeIconInput.value = this.config.typeIcon;
        
        this.setting = new Setting({
            confirmCallback: async () => {
                this.config.author = authorInput.value;
                this.config.location = locationInput.value;
                this.config.sidebarWidth = widthSelect.value;
                this.config.timeIcon = timeIconInput.value;      // 新增
                this.config.authorIcon = authorIconInput.value;  // 新增
                this.config.typeIcon = typeIconInput.value;      // 新增
                
                await this.saveData(STORAGE_NAME, this.config);
                showMessage('配置已保存');
                
                // 重新渲染侧边栏以应用新配置
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
        
        // this.setting.addItem({
        //     title: '地点',
        //     description: '在时间记录中显示的地点',
        //     createActionElement: () => locationInput
        // });
        
        this.setting.addItem({
            title: '侧边栏宽度',
            description: '时间记录侧边栏的宽度',
            createActionElement: () => widthSelect
        });
        
        // 新增：时间图标设置项
        this.setting.addItem({
            title: '时间图标',
            description: '时间记录中时间前的图标',
            createActionElement: () => timeIconInput
        });
        
        // 新增：作者图标设置项
        this.setting.addItem({
            title: '作者图标',
            description: '时间记录中作者前的图标',
            createActionElement: () => authorIconInput
        });
        
        // 新增：类型图标设置项
        this.setting.addItem({
            title: '类型图标',
            description: '时间记录中类型前的图标',
            createActionElement: () => typeIconInput
        });
    }
    
    async executeSQL(sql) {
        try {
            // 修改点1：移除Authorization头部，思源会自动处理身份验证
            const response = await fetch('/api/query/sql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                    // 移除了 Authorization 头部
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
            ORDER BY a1.value DESC
            LIMIT 500
        `;
        
        const records = await this.executeSQL(sql);
        
        return records.map(record => {
            let content = record.content || '';
            
            // 移除所有时间前缀格式
            // 1. 移除 HH:MM 或 HH:MM:SS 格式的时间前缀
            // 2. 移除后面可能跟的任何字符直到第一个冒号（中文或英文）
            // 3. 移除冒号和后面的空格
            const timePrefixPatterns = [
                // 格式1: 18:47 记录：内容
                /^\d{1,2}:\d{2}(?::\d{2})?\s*[\s\S]{0,20}?[:：]\s*/,
                // 格式2: 18:47内容（没有空格）
                /^\d{1,2}:\d{2}(?::\d{2})?[\s\S]{0,20}?[:：]\s*/,
                // 格式3: 18:47 内容（没有冒号）
                /^\d{1,2}:\d{2}(?::\d{2})?\s+/,
                // 格式4: [18:47] 内容
                /^\[\d{1,2}:\d{2}(?::\d{2})?\]\s*[\s\S]{0,20}?[:：]\s*/,
                // 格式5: 【18:47】内容
                /^【\d{1,2}:\d{2}(?::\d{2})?】\s*[\s\S]{0,20}?[:：]\s*/,
                // 格式6: (18:47) 内容
                /^\(\d{1,2}:\d{2}(?::\d{2})?\)\s*[\s\S]{0,20}?[:：]\s*/,
                // 格式7: 18:47-内容
                /^\d{1,2}:\d{2}(?::\d{2})?-\s*[\s\S]{0,20}?[:：]\s*/,
                // 格式8: 18:47.内容
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
            
            // 如果处理后内容为空，使用原始内容
            if (!content && originalContent) {
                content = originalContent;
            }
            
            // 获取记录类型
            let recordType = record.lifelog_type || '记录';
            
            // 存储发现的类型
            this.discoveredTypes.add(recordType);
            
            // 处理日期时间 - 使用 custom-lifelog-created
            let dateObj = null;
            let displayDateTime = '';
            
            if (record.lifelog_created) {
                // 尝试解析格式：2026/02/04 15:25:20
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
        // 使用配置的时间图标
        dateSpan.innerHTML = this.config.timeIcon + ' ' + record.displayDate;
        
        const authorSpan = document.createElement('span');
        // 使用配置的作者图标
        authorSpan.innerHTML = this.config.authorIcon + ' ' + this.config.author;
        
        const typeSpan = document.createElement('span');
        // 使用配置的类型图标
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
    
    drawPieChart(canvasId, data, labels, colors) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(centerX, centerY) - 10;
        
        ctx.clearRect(0, 0, width, height);
        
        const total = data.reduce((sum, value) => sum + value, 0);
        if (total === 0) return;
        
        let startAngle = 0;
        
        for (let i = 0; i < data.length; i++) {
            const sliceAngle = (2 * Math.PI * data[i]) / total;
            
            ctx.beginPath();
            ctx.fillStyle = colors[i];
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
            ctx.closePath();
            ctx.fill();
            
            ctx.beginPath();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1.5;
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(
                centerX + radius * Math.cos(startAngle),
                centerY + radius * Math.sin(startAngle)
            );
            ctx.stroke();
            
            const midAngle = startAngle + sliceAngle / 2;
            const labelRadius = radius * 0.7;
            const labelX = centerX + labelRadius * Math.cos(midAngle);
            const labelY = centerY + labelRadius * Math.sin(midAngle);
            
            const percentage = ((data[i] / total) * 100);
            if (percentage > 5) {
                ctx.fillStyle = 'white';
                ctx.font = 'bold 11px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(percentage.toFixed(1) + '%', labelX, labelY);
            }
            
            startAngle += sliceAngle;
        }
        
        ctx.beginPath();
        ctx.fillStyle = 'white';
        ctx.arc(centerX, centerY, radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#333';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('总计', centerX, centerY - 10);
        
        ctx.fillStyle = '#667eea';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(total, centerX, centerY + 12);
    }
    
    createPieChartLegend(data, labels, colors) {
        const legendContainer = document.createElement('div');
        legendContainer.className = 'pie-chart-legend';
        
        data.forEach((value, index) => {
            if (value > 0) {
                const legendItem = document.createElement('div');
                legendItem.className = 'legend-item';
                
                const colorBox = document.createElement('div');
                colorBox.className = 'legend-color';
                colorBox.style.backgroundColor = colors[index];
                
                const labelText = document.createElement('span');
                const percentage = ((value / data.reduce((a, b) => a + b, 0)) * 100).toFixed(1);
                labelText.textContent = `${labels[index]}: ${value} (${percentage}%)`;
                
                legendItem.appendChild(colorBox);
                legendItem.appendChild(labelText);
                legendContainer.appendChild(legendItem);
            }
        });
        
        return legendContainer;
    }
createStatsPanel(records) {
    const stats = this.calculateStats(records);
    const typeDistribution = this.calculateTypeDistribution(records);
    
    // 获取类型名称和数量，并排序（从高到低）
    const typeNames = Object.keys(typeDistribution);
    const typeCounts = Object.values(typeDistribution);
    
    // 创建排序后的数据
    const sortedData = typeNames.map((name, index) => ({
        name,
        count: typeCounts[index]
    })).sort((a, b) => b.count - a.count);
    
    // 计算总数和百分比
    const total = sortedData.reduce((sum, item) => sum + item.count, 0);
    sortedData.forEach(item => {
        item.percentage = total > 0 ? ((item.count / total) * 100).toFixed(1) : "0.0";
    });
    
    const panel = document.createElement('div');
    panel.className = 'stats-panel';
    
    panel.innerHTML = `
        <h4>信息统计</h4>
        <div class="stats-grid">
            <div class="stat-item ${this.currentTimeFilter === 'today' ? 'active' : ''}" data-time-filter="today">
                <div class="stat-value">${stats.day}</div>
                <div class="stat-label">今日</div>
            </div>
            <div class="stat-item ${this.currentTimeFilter === 'week' ? 'active' : ''}" data-time-filter="week">
                <div class="stat-value">${stats.week}</div>
                <div class="stat-label">本周</div>
            </div>
            <div class="stat-item ${this.currentTimeFilter === 'month' ? 'active' : ''}" data-time-filter="month">
                <div class="stat-value">${stats.month}</div>
                <div class="stat-label">本月</div>
            </div>
            <div class="stat-item ${this.currentTimeFilter === 'year' ? 'active' : ''}" data-time-filter="year">
                <div class="stat-value">${stats.year}</div>
                <div class="stat-label">今年</div>
            </div>
        </div>
        
        <div class="chart-container">
            <div class="chart-title">类型分布统计</div>
            <div class="stats-chart-container" id="stats-chart">
                <!-- 图表项将通过JavaScript动态添加 -->
            </div>
        </div>
    `;
    
    // 绑定统计项点击事件
    panel.querySelectorAll('.stat-item').forEach(item => {
        item.addEventListener('click', () => {
            this.currentTimeFilter = item.dataset.timeFilter;
            this.updateTimeFilterButtons();
            this.renderTimeline();
        });
    });
    
    // 添加图表项
    const chartContainer = panel.querySelector('#stats-chart');
    if (chartContainer) {
        sortedData.forEach((item, index) => {
            const chartItem = document.createElement('div');
            chartItem.className = 'chart-item';
            
            chartItem.innerHTML = `
                <div class="chart-label">${item.name}</div>
                <div class="chart-bar-container">
                    <div class="chart-bar" style="width: ${item.percentage}%">
                        <span class="chart-bar-value">${item.percentage}%</span>
                    </div>
                </div>
                <div class="chart-info">
                    <span class="chart-count">${item.count}笔</span>
                    <span class="chart-percentage">${item.percentage}%</span>
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
        
        // 清空现有按钮（除了"全部"按钮）
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
            // 更新刷新按钮状态
            const refreshBtn = this.sidebarContainer.querySelector('.time-record-refresh');
            if (refreshBtn) {
                refreshBtn.classList.add('loading');
                refreshBtn.disabled = true;
            }
            
            // 显示加载状态
            contentEl.innerHTML = `
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                    <p>加载中...</p>
                </div>
            `;
            
            const records = await this.fetchTimeRecords();
            this.currentData = records;
            
            // 更新类型筛选按钮
            this.updateTypeFilterButtons();
            
            // 渲染时间线
            this.renderTimeline();
            
            // 更新最后刷新时间和记录总数
            this.lastRefreshTime = Date.now();
            this.updateFooterInfo(records.length);
            
        } catch (error) {
            console.error('加载时间记录失败:', error);
            contentEl.innerHTML = `
                <div class="error-state">
                    <div class="error-state-icon">⚠️</div>
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
            
            // 绑定重试按钮事件
            const retryBtn = contentEl.querySelector('.retry-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    this.loadTimeRecords();
                });
            }
        } finally {
            this.isLoading = false;
            
            // 恢复刷新按钮状态
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
                <div class="empty-state">
                    <div class="empty-state-icon">📅</div>
                    <p style="font-size: 14px; color: #999; margin-bottom: 8px;">还没有时间记录</p>
                    <p style="font-size: 12px; color: #ccc;">
                        请在文档中添加带有 custom-lifelog-created 和 custom-lifelog-type 属性的段落
                    </p>
                </div>
            `;
            return;
        }
        
        // 应用时间筛选
        let filteredRecords = this.filterByTime(this.currentData, this.currentTimeFilter);
        
        // 应用类型筛选
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
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <p style="font-size: 14px; color: #999; margin-bottom: 8px;">没有找到匹配的记录</p>
                    <p style="font-size: 12px; color: #ccc;">请尝试选择其他筛选条件</p>
                </div>
            `;
        }
    }
    
    updateFooterInfo(totalCount) {
        if (!this.sidebarContainer) return;
        
        const lastRefreshEl = this.sidebarContainer.querySelector('#last-refresh-time');
        const totalCountEl = this.sidebarContainer.querySelector('#total-count');
        
        if (lastRefreshEl) {
            lastRefreshEl.textContent = this.formatTimeSince(this.lastRefreshTime);
        }
        
        if (totalCountEl) {
            totalCountEl.textContent = totalCount;
        }
    }
    
    formatTimeSince(timestamp) {
        const now = Date.now();
        const diff = Math.floor((now - timestamp) / 1000); // 秒
        
        if (diff < 10) return '刚刚';
        if (diff < 60) return `${diff}秒前`;
        if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
        return `${Math.floor(diff / 86400)}天前`;
    }
    
    toggleSidebar() {
        if (this.dockInstance) {
            // 确保停靠栏显示
            this.dockInstance.element.style.display = 'flex';
        }
    }
    
    async onLayoutReady() {}
    
    onunload() {
        
        // 1. 清理设置面板
        if (this.setting) {
            this.setting = null;
        }
        
        // 2. 清理停靠栏实例
        if (this.dockInstance) {
            this.dockInstance = null;
        }
        
        // 3. 清理侧边栏容器和事件监听器
        if (this.sidebarContainer) {
            this.sidebarContainer.innerHTML = '';
            this.sidebarContainer = null;
        }
        
        // 4. 清理全局状态
        this.currentData = [];
        this.discoveredTypes.clear();
        
        console.log("时迹插件 已关闭");
    }
    
    // 测试
    uninstall() {
        this.removeData(STORAGE_NAME).catch(e => {
            showMessage(`uninstall [${this.name}] remove data [${STORAGE_NAME}] fail: ${e.msg}`);
        });
    }
};