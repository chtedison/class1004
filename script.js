document.addEventListener('DOMContentLoaded', () => {

    /**
     * 主要應用程式模組
     */
    const App = {
        state: {
            reservations: [],
            currentYear: new Date().getFullYear(),
            currentMonth: new Date().getMonth(),
            isLoading: false,
        },

        config: {
            GAS_URL: "https://script.google.com/macros/s/AKfycbya1Dz_6yxWWPxtO92qred-qoR5qUaRcntTXwtmK6tvO-rX6yUUfOB_MAEJxS69QQEpaA/exec",
        },

        elements: {
            reservationForm: document.getElementById('reservationForm'),
            timeSelect: document.getElementById('time'),
            durationSelect: document.getElementById('duration'),
            reservationTimeDiv: document.getElementById('reservationTime'),
            dateInput: document.getElementById('date'),
            unitInput: document.getElementById('unit'),
            meetingNameInput: document.getElementById('meetingName'),
            nameInput: document.getElementById('name'),
            emailInput: document.getElementById('email'),
            submitButton: document.querySelector('#reservationForm button[type="submit"]'),
            calendarContainer: document.getElementById('calendar'),
            yearSelect: document.getElementById('yearSelect'),
            monthSelect: document.getElementById('monthSelect'),
            reservedSlotsDiv: document.getElementById('reservedSlots'),
            cancelForm: document.getElementById('cancelForm'),
            cancelEmailInput: document.getElementById('cancelEmailInput'),
            userReservationsDiv: document.getElementById('userReservations'),
            // 【全新加入】定義查詢頁面的提交按鈕
            cancelSubmitButton: document.querySelector('#cancelForm button[type="submit"]'),
        },

        init() {
            if (!this.config.GAS_URL) {
                console.warn("GAS_URL 尚未設定。系統將無法與後端溝通。");
                alert("系統設定不完整，請聯絡管理員。");
            }
            this.bindEvents();
            this.render();
        },

        bindEvents() {
            if (this.elements.reservationForm) {
                this.elements.reservationForm.addEventListener('submit', this.handlers.handleReservationSubmit.bind(this));
                this.elements.timeSelect.addEventListener('change', () => this.render('reservationTime'));
                this.elements.durationSelect.addEventListener('change', () => this.render('reservationTime'));
            }

            if (this.elements.calendarContainer) {
                this.elements.yearSelect.addEventListener('change', this.handlers.handleYearChange.bind(this));
                this.elements.monthSelect.addEventListener('change', this.handlers.handleMonthChange.bind(this));
                this.elements.calendarContainer.addEventListener('click', this.handlers.handleDateClick.bind(this));
            }

            if (this.elements.cancelForm) {
                this.elements.cancelForm.addEventListener('submit', this.handlers.handleCancelQuery.bind(this));
                this.elements.userReservationsDiv.addEventListener('click', this.handlers.handleCancelClick.bind(this));
            }
        },

        async render(component = null) {
            if (this.elements.reservationForm && !component) {
                this.ui.populateYearSelect();
                this.elements.monthSelect.value = this.state.currentMonth;
                this.ui.setMinDate();
                await this.fetchData();
            } else if (this.elements.cancelForm && !component) {
                await this.fetchData();
            }

            if (component === 'calendar') this.ui.generateCalendar();
            if (component === 'reservationTime') this.ui.updateReservationTime();
        },

        async fetchData() {
            this.ui.setLoading(true);
            try {
                const data = await apiService.getReservations(this.config.GAS_URL);
                if (Array.isArray(data)) {
                    this.state.reservations = data;
                } else {
                    // 如果後端回傳錯誤物件，則清空資料並顯示錯誤
                    this.state.reservations = [];
                    throw new Error(data.message || '回傳資料格式不正確');
                }
                if (this.elements.calendarContainer) this.ui.generateCalendar();
            } catch (error) {
                console.error("獲取預約資料失敗:", error);
                alert(`無法從伺服器獲取預約資料：${error.message}`);
            } finally {
                this.ui.setLoading(false);
            }
        },

        handlers: {
            async handleReservationSubmit(event) {
                event.preventDefault();
                if (this.state.isLoading) return;

                const newReservation = {
                    unit: this.elements.unitInput.value.trim(),
                    meetingName: this.elements.meetingNameInput.value.trim(),
                    name: this.elements.nameInput.value.trim(),
                    email: this.elements.emailInput.value.trim(),
                    date: this.elements.dateInput.value,
                    time: this.elements.timeSelect.value,
                    duration: parseFloat(this.elements.durationSelect.value)
                };

                if (!newReservation.unit || !newReservation.meetingName || !newReservation.name || !newReservation.email || !newReservation.date || !newReservation.time) {
                    alert('請填寫所有必填欄位。');
                    return;
                }

                if (logic.checkLunchBreakConflict(newReservation.time, newReservation.duration)) {
                    alert('警告：您選擇的預約時間與午休時間（12:30~13:30）重疊。');
                    return;
                }
                if (logic.isTimeSlotBooked(this.state.reservations, newReservation.date, newReservation.time, newReservation.duration)) {
                    alert('該時段已被預約，請選擇其他時間。');
                    return;
                }

                this.ui.setLoading(true, "處理中...");
                try {
                    const result = await apiService.addReservation(this.config.GAS_URL, newReservation);
                    if (result.status === "success") {
                        alert('預約成功！');
                        this.elements.reservationForm.reset();
                        await this.fetchData();
                    } else {
                        throw new Error(result.message || "後端回傳未知錯誤");
                    }
                } catch (error) {
                    console.error("新增預約失敗:", error);
                    alert(`預約失敗: ${error.message}`);
                } finally {
                    this.ui.setLoading(false);
                }
            },

            handleYearChange(event) {
                this.state.currentYear = parseInt(event.target.value);
                this.render('calendar');
            },

            handleMonthChange(event) {
                this.state.currentMonth = parseInt(event.target.value);
                this.render('calendar');
            },

            handleDateClick(event) {
                const dayElement = event.target.closest('.day:not(.empty)');
                if (dayElement) {
                    const date = `${this.state.currentYear}-${String(this.state.currentMonth + 1).padStart(2, '0')}-${String(dayElement.textContent).padStart(2, '0')}`;
                    this.ui.showReservedSlots(date);
                }
            },

            handleCancelQuery(event) {
                event.preventDefault();
                const email = this.elements.cancelEmailInput.value.trim();
                if (email) {
                    this.ui.renderUserReservations(email);
                } else {
                    alert('請輸入電子郵件地址。');
                }
            },

            async handleCancelClick(event) {
                const cancelButton = event.target.closest('.cancel-btn');
                if (!cancelButton || this.state.isLoading) return;

                const reservationId = cancelButton.dataset.id;
                if (confirm("您確定要取消這筆預約嗎？")) {
                    this.ui.setLoading(true);
                    try {
                        const result = await apiService.deleteReservation(this.config.GAS_URL, reservationId);
                        if (result.status === "success") {
                            alert('預約已成功取消！');
                            const currentEmail = this.elements.cancelEmailInput.value;
                            await this.fetchData();
                            this.ui.renderUserReservations(currentEmail);
                        } else {
                            throw new Error(result.message || "後端回傳未知錯誤");
                        }
                    } catch (error) {
                        console.error("取消預約失敗:", error);
                        alert(`取消失敗: ${error.message}`);
                    } finally {
                        this.ui.setLoading(false);
                    }
                }
            }
        },

        ui: {
            setLoading(isLoading, message = "確認預約") {
                App.state.isLoading = isLoading;

                 // 控制預約頁面的按鈕
                if (App.elements.submitButton) {
                    App.elements.submitButton.disabled = isLoading;
                    App.elements.submitButton.textContent = isLoading ? message : "確認預約";
                }

                 // 【關鍵修正】同時控制查詢頁面的按鈕和輸入框
                if (App.elements.cancelSubmitButton) {
                    App.elements.cancelSubmitButton.disabled = isLoading;
                }

                if (App.elements.cancelEmailInput) {
                    // 當 isLoading 為 true 時，禁用輸入框；為 false 時，啟用
                    App.elements.cancelEmailInput.disabled = isLoading;
                }
                
                // 控制日曆的載入動畫 (這個本來就有)
                App.elements.calendarContainer?.classList.toggle('loading', isLoading);
            },

            populateYearSelect() {
                const yearSelect = App.elements.yearSelect;
                const currentYearValue = new Date().getFullYear();
                yearSelect.innerHTML = '';
                for (let year = currentYearValue - 5; year <= currentYearValue + 5; year++) {
                    const option = document.createElement('option');
                    option.value = year;
                    option.textContent = year;
                    yearSelect.appendChild(option);
                }
                yearSelect.value = App.state.currentYear;
            },

            generateCalendar() {
                const { currentYear, currentMonth, reservations } = App.state;
                const calendarElement = App.elements.calendarContainer;
                if (!calendarElement) return;

                const firstDay = new Date(currentYear, currentMonth, 1);
                const lastDay = new Date(currentYear, currentMonth + 1, 0);
                let html = '<div class="weekdays">一</div><div class="weekdays">二</div><div class="weekdays">三</div><div class="weekdays">四</div><div class="weekdays">五</div><div class="weekdays">六</div><div class="weekdays">日</div>';
                
                const firstDayOfWeek = (firstDay.getDay() === 0) ? 6 : firstDay.getDay() - 1;
                for (let i = 0; i < firstDayOfWeek; i++) {
                    html += '<div class="day empty"></div>';
                }

                for (let day = 1; day <= lastDay.getDate(); day++) {
                    const currentDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isBooked = reservations.some(res => res.date === currentDate);
                    html += `<div class="day ${isBooked ? 'booked' : ''}">${day}</div>`;
                }
                calendarElement.innerHTML = html;
            },

            showReservedSlots(date) {
                const { reservations } = App.state;
                const reservedSlotsDiv = App.elements.reservedSlotsDiv;
                const reservedThisDate = reservations.filter(res => res.date === date);

                if (reservedThisDate.length === 0) {
                    reservedSlotsDiv.innerHTML = `<p>日期 ${date} 尚無預約。</p>`;
                    return;
                }

                reservedThisDate.sort((a, b) => a.time.localeCompare(b.time));
                let html = '';
                reservedThisDate.forEach(res => {
                    const { endTime } = logic.calculateTimeDetails(res.time, res.duration);
                    html += `<p>${res.time} ~ ${endTime} | ${res.meetingName} | ${res.unit} (${res.name})</p>`;
                });
                reservedSlotsDiv.innerHTML = html;
            },
            
            renderUserReservations(email) {
                const { reservations } = App.state;
                const userReservationsDiv = App.elements.userReservationsDiv;
                // 【關鍵修正】
                // 在比對前，將使用者的輸入和資料庫中的 email 都轉換為小寫並去除空白。
                // 如此一來，無論大小寫或前後是否有空格，都能正確匹配。
                const userReservations = reservations.filter(res => {
                    // 防呆設計：確保 res.email 存在且為字串，避免對 null 或 undefined 操作
                    const dbEmail = res.email ? res.email.trim().toLowerCase() : '';
                    const inputEmail = email.trim().toLowerCase();
                    return dbEmail === inputEmail;
                });

                if (userReservations.length === 0) {
                    userReservationsDiv.innerHTML = '<p>未找到與該電子郵件相符的預約。</p>';
                    return;
                }

                let html = '<h4>您所有的預約紀錄：</h4>';
                userReservations.forEach(res => {
                    const { endTime } = logic.calculateTimeDetails(res.time, res.duration);
                    html += `
                    <div class="reservation-item">
                        <p>
                            <strong>會議時間:</strong> ${res.date} ${res.time}~${endTime} <br>
                            <strong>會議名稱:</strong> ${res.meetingName}  <strong>會議人:</strong> ${res.name}
                        </p>
                        <button class="cancel-btn" data-id="${res.id}">確認取消</button>
                    </div>
                    `;
                });
                userReservationsDiv.innerHTML = html;
            },

            updateReservationTime() {
                const { timeSelect, durationSelect, reservationTimeDiv } = App.elements;
                if (!timeSelect || !durationSelect || !reservationTimeDiv) return;
                const selectedTime = timeSelect.value;
                const selectedDuration = parseFloat(durationSelect.value);

                if (selectedTime) {
                    const { endTime } = logic.calculateTimeDetails(selectedTime, selectedDuration);
                    reservationTimeDiv.textContent = `申請時段: ${selectedTime} ~ ${endTime}`;
                } else {
                    reservationTimeDiv.textContent = '';
                }
            },
            
            setMinDate() {
                App.elements.dateInput?.setAttribute('min', new Date().toISOString().split('T')[0]);
            }
        }
    };

    const logic = {
        calculateTimeDetails(startTime, duration) {
            const startHour = parseInt(startTime.split(':')[0]);
            const startMinute = parseInt(startTime.split(':')[1]);
            const durationMinutes = duration * 60;
            const startTotalMinutes = startHour * 60 + startMinute;
            const endTotalMinutes = startTotalMinutes + durationMinutes;
            const endHour = Math.floor(endTotalMinutes / 60);
            const endMinute = endTotalMinutes % 60;
            const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
            return { endTime, startTotalMinutes, endTotalMinutes };
        },

        isTimeSlotBooked(reservations, date, time, duration) {
            const { startTotalMinutes: newStart, endTotalMinutes: newEnd } = this.calculateTimeDetails(time, duration);
            return reservations.some(res => {
                if (res.date !== date) return false;
                const { startTotalMinutes: existingStart, endTotalMinutes: existingEnd } = this.calculateTimeDetails(res.time, res.duration);
                return newStart < existingEnd && newEnd > existingStart;
            });
        },

        checkLunchBreakConflict(time, duration) {
            const { startTotalMinutes, endTotalMinutes } = this.calculateTimeDetails(time, duration);
            const lunchStart = 12 * 60 + 30;
            const lunchEnd = 13 * 60 + 30;
            return startTotalMinutes < lunchEnd && endTotalMinutes > lunchStart;
        }
    };

    const apiService = {
        async getReservations(url) {
            if (!url) return [];
            const urlWithCacheBust = `${url}?v=${new Date().getTime()}`;
            const response = await fetch(urlWithCacheBust);
            if (!response.ok) throw new Error(`HTTP 錯誤! 狀態: ${response.status}`);
            return await response.json();
        },

        async addReservation(url, reservationData) {
            if (!url) throw new Error("API URL 未設定");
            const payload = { action: "addReservation", ...reservationData };
            const response = await fetch(url, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            });
            return await response.json();
        },

        async deleteReservation(url, reservationId) {
            if (!url) throw new Error("API URL 未設定");
            const payload = { action: "deleteReservation", id: reservationId };
            const response = await fetch(url, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            });
            return await response.json();
        }
    };

    App.init();
});
