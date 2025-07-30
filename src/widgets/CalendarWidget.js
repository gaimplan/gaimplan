import { invoke } from '@tauri-apps/api/core';

export class CalendarWidget {
    constructor() {
        console.log('[CalendarWidget] Initializing Calendar widget');
        
        this.container = null;
        this.calendarHeader = null;
        this.calendarGrid = null;
        this.monthYearDisplay = null;
        
        // State
        this.currentDate = new Date();
        this.selectedDate = null;
        this.dailyNotes = new Map(); // Map of date strings to note info
        
        // Date formatting options
        this.monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
        this.dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    }
    
    mount(containerElement) {
        console.log('[CalendarWidget] Mounting widget');
        
        // Create container
        this.container = document.createElement('div');
        this.container.className = 'calendar-widget';
        
        // Create header with navigation
        this.createHeader();
        
        // Create calendar grid
        this.createCalendarGrid();
        
        // Mount to parent
        containerElement.appendChild(this.container);
        
        // Load saved settings
        this.loadSettings().then(() => {
            // Initial render after settings are loaded
            this.updateCalendar();
            
            // Load daily notes for current month
            this.loadDailyNotes();
        });
    }
    createHeader() {
        this.calendarHeader = document.createElement('div');
        this.calendarHeader.className = 'calendar-header';
        
        // Month/Year display
        this.monthYearDisplay = document.createElement('div');
        this.monthYearDisplay.className = 'calendar-month-year';
        
        // Navigation and settings container
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'calendar-controls';
        
        // Navigation buttons
        const navContainer = document.createElement('div');
        navContainer.className = 'calendar-nav';
        
        const prevButton = document.createElement('button');
        prevButton.className = 'calendar-nav-btn';
        prevButton.innerHTML = '‹';
        prevButton.title = 'Previous month';
        prevButton.addEventListener('click', () => this.navigateMonth(-1));
        
        const todayButton = document.createElement('button');
        todayButton.className = 'calendar-nav-btn calendar-today-btn';
        todayButton.textContent = 'Today';
        todayButton.title = 'Go to today';
        todayButton.addEventListener('click', () => this.goToToday());
        
        const nextButton = document.createElement('button');
        nextButton.className = 'calendar-nav-btn';
        nextButton.innerHTML = '›';
        nextButton.title = 'Next month';
        nextButton.addEventListener('click', () => this.navigateMonth(1));
        
        // Settings button
        const settingsButton = document.createElement('button');
        settingsButton.className = 'calendar-nav-btn calendar-settings-btn';
        settingsButton.innerHTML = '⚙️';
        settingsButton.title = 'Calendar settings';
        settingsButton.addEventListener('click', () => this.toggleSettings());
        
        navContainer.appendChild(prevButton);
        navContainer.appendChild(todayButton);
        navContainer.appendChild(nextButton);
        
        controlsContainer.appendChild(navContainer);
        controlsContainer.appendChild(settingsButton);
        
        this.calendarHeader.appendChild(this.monthYearDisplay);
        this.calendarHeader.appendChild(controlsContainer);
        this.container.appendChild(this.calendarHeader);
    }
    
    createCalendarGrid() {
        // Create weekday headers
        const weekdayHeader = document.createElement('div');
        weekdayHeader.className = 'calendar-weekdays';
        
        for (const day of this.dayNames) {
            const dayElement = document.createElement('div');
            dayElement.className = 'calendar-weekday';
            dayElement.textContent = day;
            weekdayHeader.appendChild(dayElement);
        }
        
        // Create grid container
        this.calendarGrid = document.createElement('div');
        this.calendarGrid.className = 'calendar-grid';
        
        this.container.appendChild(weekdayHeader);
        this.container.appendChild(this.calendarGrid);
    }
    
    updateCalendar() {
        console.log('[CalendarWidget] Updating calendar for', this.currentDate.toLocaleDateString());
        
        // Update month/year display
        const month = this.monthNames[this.currentDate.getMonth()];
        const year = this.currentDate.getFullYear();
        this.monthYearDisplay.textContent = `${month} ${year}`;
        
        // Clear grid
        this.calendarGrid.innerHTML = '';
        
        // Get first day of month and number of days
        const firstDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        const lastDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();
        
        // Get today's date for comparison
        const today = new Date();
        const todayDateString = this.formatDateString(today);
        
        // Add empty cells for days before month starts
        for (let i = 0; i < startingDayOfWeek; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day calendar-day-empty';
            this.calendarGrid.appendChild(emptyDay);
        }
        
        // Add days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const dayElement = document.createElement('div');
            dayElement.className = 'calendar-day';
            
            const currentDayDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), day);
            const dateString = this.formatDateString(currentDayDate);
            
            // Check if this is today
            if (dateString === todayDateString) {
                dayElement.classList.add('calendar-day-today');
            }
            
            // Check if this day has a note
            if (this.dailyNotes.has(dateString)) {
                dayElement.classList.add('calendar-day-has-note');
            }
            
            // Add day number
            const dayNumber = document.createElement('span');
            dayNumber.className = 'calendar-day-number';
            dayNumber.textContent = day;
            dayElement.appendChild(dayNumber);
            
            // Add click handler
            dayElement.addEventListener('click', () => this.handleDayClick(currentDayDate));
            
            // Add hover handler for preview
            dayElement.addEventListener('mouseenter', (e) => this.showDayPreview(e, dateString));
            dayElement.addEventListener('mouseleave', () => this.hideDayPreview());
            
            this.calendarGrid.appendChild(dayElement);
        }
        
        // Add empty cells to complete the grid
        const totalCells = startingDayOfWeek + daysInMonth;
        const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        
        for (let i = 0; i < remainingCells; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day calendar-day-empty';
            this.calendarGrid.appendChild(emptyDay);
        }
    }
    
    navigateMonth(direction) {
        this.currentDate.setMonth(this.currentDate.getMonth() + direction);
        this.updateCalendar();
        this.loadDailyNotes();
    }
    
    goToToday() {
        this.currentDate = new Date();
        this.updateCalendar();
        this.loadDailyNotes();
    }
    
    formatDateString(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    formatDateForFilename(date) {
        // Common daily note format: YYYY-MM-DD.md
        return `${this.formatDateString(date)}.md`;
    }
    
    async loadDailyNotes() {
        console.log('[CalendarWidget] Loading daily notes for current month');
        
        try {
            // Get the month range
            const year = this.currentDate.getFullYear();
            const month = String(this.currentDate.getMonth() + 1).padStart(2, '0');
            
            // Clear existing notes
            this.dailyNotes.clear();
            
            // Check if MCP search server is available
            if (window.mcpManager && window.mcpManager.servers && window.mcpManager.servers.get('gaimplan-search')) {
                console.log('[CalendarWidget] Using MCP search server for daily notes');
                
                // Get daily notes folder
                const dailyNotesFolder = await this.getDailyNotesFolder();
                
                // Search for daily notes with pattern YYYY-MM-*.md in the daily notes folder
                const searchPattern = `${year}-${month}-*.md`;
                
                try {
                    const result = await window.mcpManager.invokeTool('gaimplan-search', 'search_files', {
                        query: '',
                        path: '.',
                        pattern: searchPattern,
                        case_sensitive: false,
                        whole_word: false,
                        regex: false,
                        max_results: 100
                    });
                    
                    if (result && result.results) {
                        console.log(`[CalendarWidget] Found ${result.results.length} daily notes`);
                        
                        // Process each found note
                        for (const note of result.results) {
                            // Extract date from filename
                            const match = note.path.match(/(\d{4}-\d{2}-\d{2})\.md$/);
                            if (match) {
                                const dateString = match[1];
                                const noteDate = new Date(dateString);
                                
                                // Only include notes from current month
                                if (noteDate.getMonth() === this.currentDate.getMonth()) {
                                    this.dailyNotes.set(dateString, {
                                        exists: true,
                                        path: note.path,
                                        preview: note.snippet || `Daily note for ${dateString}`
                                    });
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('[CalendarWidget] MCP search error:', error);
                }
            } else {
                console.log('[CalendarWidget] MCP search not available');
                // Without MCP search, we can't detect existing notes
                // The calendar will show all days as empty until MCP is available
            }
            
            // Update calendar to show which days have notes
            this.updateCalendar();
            
        } catch (error) {
            console.error('[CalendarWidget] Error loading daily notes:', error);
        }
    }
    
    async handleDayClick(date) {
        console.log('[CalendarWidget] Day clicked:', date);
        
        const dateString = this.formatDateString(date);
        const filename = this.formatDateForFilename(date);
        
        // Check if note already exists
        const noteInfo = this.dailyNotes.get(dateString);
        
        if (noteInfo && noteInfo.exists) {
            // Open existing note
            console.log('[CalendarWidget] Opening existing daily note:', noteInfo.path);
            
            // Use the file opener from main.js
            if (window.openFile) {
                window.openFile(noteInfo.path);
                this.showNotification(`Opened ${dateString}`);
            }
        } else {
            // Create new daily note
            console.log('[CalendarWidget] Creating new daily note:', filename);
            
            // Get daily notes folder from settings or use default
            const dailyNotesFolder = await this.getDailyNotesFolder();
            const dailyNotePath = `${dailyNotesFolder}/${filename}`;
            
            // Create daily note content with template
            const template = this.getDailyNoteTemplate(date);
            
            // Ensure the daily notes folder exists
            await this.ensureDailyNotesFolder();
            
            // Create the file using the filesystem API
            if (window.createAndOpenFile) {
                window.createAndOpenFile(dailyNotePath, template);
                this.showNotification(`Created ${dateString}`);
                
                // Add to our notes map
                this.dailyNotes.set(dateString, {
                    exists: true,
                    path: dailyNotePath,
                    preview: `Daily note for ${dateString}`
                });
                
                // Update calendar to show the new note
                this.updateCalendar();
            } else {
                // Fallback: just emit event
                const event = new CustomEvent('calendar-open-daily-note', {
                    detail: {
                        date: dateString,
                        filename: filename,
                        path: dailyNotePath,
                        content: template
                    }
                });
                
                window.dispatchEvent(event);
                this.showNotification(`Create note for ${dateString}`);
            }
        }
    }
    
    getDailyNoteTemplate(date) {
        const dateString = this.formatDateString(date);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        const monthName = this.monthNames[date.getMonth()];
        const day = date.getDate();
        const year = date.getFullYear();
        const time = new Date().toLocaleTimeString();
        
        // Check if user has a custom template in settings
        const customTemplate = this.getCustomTemplate();
        if (customTemplate) {
            return this.processTemplate(customTemplate, date);
        }
        
        // Use default template
        return this.processTemplate(this.getDefaultTemplate(), date);
    }
    
    getCustomTemplate() {
        // Load from settings if available
        const settings = this.getSettings();
        return settings.dailyNoteTemplate || null;
    }
    
    async toggleSettings() {
        if (this.settingsPanel) {
            this.closeSettings();
        } else {
            await this.openSettings();
        }
    }
    
    async openSettings() {
        console.log('[CalendarWidget] Opening settings');
        
        // Create settings panel
        this.settingsPanel = document.createElement('div');
        this.settingsPanel.className = 'calendar-settings-panel';
        
        // Settings header
        const header = document.createElement('div');
        header.className = 'calendar-settings-header';
        header.innerHTML = `
            <h3>Calendar Settings</h3>
            <button class="calendar-settings-close" title="Close">×</button>
        `;
        
        header.querySelector('.calendar-settings-close').addEventListener('click', () => this.closeSettings());
        
        // Template section
        const templateSection = document.createElement('div');
        templateSection.className = 'calendar-settings-section';
        
        const templateLabel = document.createElement('label');
        templateLabel.innerHTML = `
            <h4>Daily Note Template</h4>
            <p class="help-text">Customize your daily note template. Available variables:</p>
            <ul class="template-variables">
                <li><code>{{fullDate}}</code> - Full date (e.g., "Thursday, July 17, 2025")</li>
                <li><code>{{date}}</code> - YYYY-MM-DD format</li>
                <li><code>{{dayName}}</code> - Day name</li>
                <li><code>{{monthName}}</code> - Month name</li>
                <li><code>{{day}}</code> - Day number</li>
                <li><code>{{year}}</code> - Year</li>
                <li><code>{{time}}</code> - Creation time</li>
            </ul>
        `;
        
        const templateTextarea = document.createElement('textarea');
        templateTextarea.className = 'calendar-template-editor';
        templateTextarea.placeholder = 'Enter your custom template here...';
        templateTextarea.rows = 15;
        
        // Load current template
        const currentTemplate = this.getCustomTemplate() || this.getDefaultTemplate();
        templateTextarea.value = currentTemplate;
        
        // Preview section
        const previewSection = document.createElement('div');
        previewSection.className = 'calendar-template-preview';
        previewSection.innerHTML = '<h4>Preview</h4><pre class="preview-content"></pre>';
        
        // Update preview on change
        const updatePreview = () => {
            const sampleDate = new Date();
            const preview = this.processTemplate(templateTextarea.value, sampleDate);
            previewSection.querySelector('.preview-content').textContent = preview;
        };
        
        templateTextarea.addEventListener('input', updatePreview);
        updatePreview(); // Initial preview
        
        // Buttons
        const buttons = document.createElement('div');
        buttons.className = 'calendar-settings-buttons';
        buttons.innerHTML = `
            <button class="btn-secondary reset-template">Reset to Default</button>
            <button class="btn-primary save-template">Save Template</button>
        `;
        
        buttons.querySelector('.reset-template').addEventListener('click', () => {
            templateTextarea.value = this.getDefaultTemplate();
            updatePreview();
        });
        
        buttons.querySelector('.save-template').addEventListener('click', async () => {
            await this.saveTemplate(templateTextarea.value);
            this.closeSettings();
        });
        
        // Assemble panel
        templateSection.appendChild(templateLabel);
        templateSection.appendChild(templateTextarea);
        templateSection.appendChild(previewSection);
        
        this.settingsPanel.appendChild(header);
        this.settingsPanel.appendChild(templateSection);
        this.settingsPanel.appendChild(buttons);
        
        // Add to container
        this.container.appendChild(this.settingsPanel);
    }
    
    closeSettings() {
        if (this.settingsPanel) {
            this.settingsPanel.remove();
            this.settingsPanel = null;
        }
    }
    
    getDefaultTemplate() {
        return `# {{fullDate}}

## Tasks
- [ ] 

## Notes


## Highlights


---
*Created: {{time}}*`;
    }
    
    processTemplate(template, date) {
        const dateString = this.formatDateString(date);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        const monthName = this.monthNames[date.getMonth()];
        const day = date.getDate();
        const year = date.getFullYear();
        const time = new Date().toLocaleTimeString();
        
        return template
            .replace(/{{date}}/g, dateString)
            .replace(/{{dayName}}/g, dayName)
            .replace(/{{monthName}}/g, monthName)
            .replace(/{{day}}/g, day)
            .replace(/{{year}}/g, year)
            .replace(/{{time}}/g, time)
            .replace(/{{fullDate}}/g, `${dayName}, ${monthName} ${day}, ${year}`);
    }
    
    async saveTemplate(template) {
        console.log('[CalendarWidget] Saving template');
        
        try {
            // Get current settings
            const settings = this.getSettings();
            settings.dailyNoteTemplate = template;
            
            // Save to widget settings
            if (window.widgetSidebar) {
                await window.widgetSidebar.saveWidgetSettings('calendar', settings);
            }
            
            this.showNotification('Template saved successfully');
        } catch (error) {
            console.error('[CalendarWidget] Error saving template:', error);
            this.showNotification('Failed to save template');
        }
    }
    
    async showDayPreview(event, dateString) {
        const noteInfo = this.dailyNotes.get(dateString);
        if (!noteInfo) return;
        
        // Create preview tooltip
        const preview = document.createElement('div');
        preview.className = 'calendar-preview';
        
        // Try to load actual content preview
        if (noteInfo.path && window.mcpManager && window.mcpManager.servers && window.mcpManager.servers.get('gaimplan-filesystem')) {
            try {
                // Read first few lines of the file
                const result = await window.mcpManager.invokeTool('gaimplan-filesystem', 'read_file', {
                    path: noteInfo.path
                });
                
                if (result && result.content) {
                    // Extract first few lines or characters
                    const lines = result.content.split('\n');
                    const previewLines = lines.slice(0, 5).filter(line => line.trim());
                    const previewText = previewLines.join('\n').substring(0, 200);
                    
                    preview.innerHTML = `
                        <div class="calendar-preview-title">${dateString}</div>
                        <div class="calendar-preview-content">${this.escapeHtml(previewText)}${previewText.length >= 200 ? '...' : ''}</div>
                    `;
                } else {
                    preview.textContent = noteInfo.preview || 'Daily note';
                }
            } catch (error) {
                console.error('[CalendarWidget] Error loading preview:', error);
                preview.textContent = noteInfo.preview || 'Daily note';
            }
        } else {
            preview.textContent = noteInfo.preview || 'Daily note';
        }
        
        // Position near the day element
        const rect = event.target.getBoundingClientRect();
        const previewWidth = 250; // Approximate width
        
        // Adjust position to keep preview on screen
        let left = rect.left;
        let top = rect.bottom + 5;
        
        // Check if preview would go off right edge
        if (left + previewWidth > window.innerWidth) {
            left = window.innerWidth - previewWidth - 10;
        }
        
        // Check if preview would go off bottom edge
        if (top + 100 > window.innerHeight) {
            top = rect.top - 105; // Show above instead
        }
        
        preview.style.left = `${left}px`;
        preview.style.top = `${top}px`;
        
        document.body.appendChild(preview);
        this.currentPreview = preview;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    hideDayPreview() {
        if (this.currentPreview) {
            this.currentPreview.remove();
            this.currentPreview = null;
        }
    }
    
    showNotification(message) {
        // Simple notification - in production, use the app's notification system
        const notification = document.createElement('div');
        notification.className = 'calendar-notification';
        notification.textContent = message;
        
        this.container.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
    
    updateEditor(editor) {
        // Calendar doesn't need editor reference, but we could use it
        // to detect when daily notes are opened
        console.log('[CalendarWidget] Editor updated');
    }
    
    getSettings() {
        // Load settings from widget sidebar if available
        if (window.widgetSidebar && window.widgetSidebar.widgets) {
            const savedSettings = window.widgetSidebar.widgets.get('calendar')?.savedSettings;
            if (savedSettings) {
                return savedSettings;
            }
        }
        
        return {
            currentMonth: this.currentDate.toISOString(),
            dailyNoteTemplate: this.customTemplate || null
        };
    }
    
    async getDailyNotesFolder() {
        try {
            // Try to get from vault settings first
            const vaultSettings = await invoke('get_vault_settings', {
                vaultPath: window.currentVaultPath
            });
            
            if (vaultSettings && vaultSettings.files && vaultSettings.files.daily_notes_folder) {
                return vaultSettings.files.daily_notes_folder;
            }
        } catch (error) {
            console.error('[CalendarWidget] Error getting user settings:', error);
        }
        
        // Default to 'Daily Notes'
        return 'Daily Notes';
    }
    
    async ensureDailyNotesFolder() {
        try {
            const folderPath = await this.getDailyNotesFolder();
            
            // Check if folder exists using filesystem API
            if (window.mcpManager && window.mcpManager.servers && window.mcpManager.servers.get('gaimplan-filesystem')) {
                try {
                    // Try to read the folder
                    await window.mcpManager.invokeTool('gaimplan-filesystem', 'read_directory', {
                        path: folderPath
                    });
                } catch (error) {
                    // Folder doesn't exist, create it
                    console.log(`[CalendarWidget] Creating daily notes folder: ${folderPath}`);
                    await invoke('create_directory', {
                        vaultPath: window.currentVaultPath,
                        dirPath: folderPath
                    });
                }
            }
        } catch (error) {
            console.error('[CalendarWidget] Error ensuring daily notes folder:', error);
        }
    }
    
    async loadSettings() {
        try {
            if (!window.currentVaultPath) return;
            
            const settings = await invoke('get_widget_settings', {
                vaultPath: window.currentVaultPath
            });
            
            if (settings && settings.tab_settings && settings.tab_settings.calendar) {
                const calendarSettings = settings.tab_settings.calendar;
                console.log('[CalendarWidget] Loaded settings:', calendarSettings);
                
                // Apply settings
                if (calendarSettings.currentMonth) {
                    this.currentDate = new Date(calendarSettings.currentMonth);
                }
                
                if (calendarSettings.dailyNoteTemplate) {
                    this.customTemplate = calendarSettings.dailyNoteTemplate;
                }
                
                // Store for later use
                this.savedSettings = calendarSettings;
                
                // Update UI
                this.updateCalendar();
            }
        } catch (error) {
            console.error('[CalendarWidget] Error loading settings:', error);
        }
    }
}