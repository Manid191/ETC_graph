// Config & State
const DATA_FILE = 'data.csv';
let rawData = [];
let charts = {};

// Colors
// Colors - Updated for Light Theme
const COLORS = {
    steam: '#0ea5e9', // Sky 500
    power: '#f59e0b', // Amber 500
    temp1: '#ef4444', // Red 500
    temp2: '#a855f7', // Purple 500
    idf: '#22c55e',   // Green 500
    rgf: '#ec4899',   // Pink 500
    soot: '#dc2626'   // Red 600
};

const uploadInput = document.getElementById('uploadCsv');
const dateFilter = document.getElementById('dateFilter');

document.addEventListener('DOMContentLoaded', init);

async function init() {
    uploadInput.addEventListener('change', handleFileUpload);
    dateFilter.addEventListener('change', handleDateFilter);
    if (document.getElementById('kpiSelector3')) {
        document.getElementById('kpiSelector3').addEventListener('change', () => {
            if (charts.main) updateVisibleRange(charts.main);
        });
    }
    // await loadData(); // Disabled to prevent remembering/auto-loading old data
    document.getElementById('dateRange').textContent = 'Please open a CSV file';
}

function handleDateFilter(evt) {
    const dateStr = evt.target.value;
    if (!dateStr) return;

    // dateStr is YYYY-MM-DD
    const startOfDay = new Date(dateStr);
    startOfDay.setHours(0, 0, 0, 0);

    const minTime = startOfDay.getTime();
    const maxTime = minTime + (24 * 60 * 60 * 1000);

    if (charts.main) {
        charts.main.options.scales.x.time.unit = 'hour';
        charts.main.zoomScale('x', { min: minTime, max: maxTime }, 'default');
        updateVisibleRange(charts.main);
    }
}

function handleFileUpload(evt) {
    const file = evt.target.files[0];
    if (!file) return;

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            processData(results.data, results.meta.fields);
            document.getElementById('dateRange').textContent = `Loaded: ${file.name}`;
            evt.target.value = ''; // Reset input so same file can be uploaded again if needed
        },
        error: function (err) {
            console.error(err);
            alert('Error parsing file');
        }
    });
}

async function loadData() {
    Papa.parse(DATA_FILE, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            processData(results.data, results.meta.fields);
        },
        error: function (err) {
            console.warn('Auto-load failed (likely CORS). Waiting for user upload.', err);
            document.getElementById('dateRange').textContent = 'Please click "Open CSV" to load data.csv';
        }
    });
}

function processData(data, fields) {
    // 1. Identify Columns (fuzzy match)
    // Clean fields: replace newlines with space, trim
    const cleanFields = fields.map(f => ({
        original: f,
        norm: f.replace(/[\r\n]+/g, ' ').toLowerCase().trim()
    }));

    const keys = {};
    cleanFields.forEach(f => {
        if (f.norm.includes('date')) keys.date = f.original;
        else if (f.norm.includes('steam')) keys.steam = f.original;
        else if (f.norm.includes('export power')) keys.power = f.original;
        else if (f.norm.includes('post combustion')) keys.tempComb = f.original;
        else if (f.norm.includes('inlet bag')) keys.tempFlue = f.original;
        else if (f.norm.includes('idf')) keys.idf = f.original;
        else if (f.norm.includes('rgf')) keys.rgf = f.original;
        else if (f.norm.includes('soot')) keys.soot = f.original;
    });

    // 2. Parse & Clean
    rawData = data.map(row => {
        // Custom Date Parse for "d/m/yyyy H:mm ..."
        const dateStr = row[keys.date] || '';
        const date = parseThaiDate(dateStr);

        return {
            date: date,
            steam: parseFloat(row[keys.steam]),
            power: parseFloat(row[keys.power]),
            tempComb: parseFloat(row[keys.tempComb]),
            tempFlue: parseFloat(row[keys.tempFlue]),
            idf: parseFloat(row[keys.idf]),
            rgf: parseFloat(row[keys.rgf]),
            soot: parseFloat(row[keys.soot]) || 0
        };
    }).filter(d => d.date && !isNaN(d.date.getTime()) && !isNaN(d.power)); // Valid Date & Power

    // Sort by Date (Vital for timeline & min/max logic)
    rawData.sort((a, b) => a.date - b.date);

    if (rawData.length === 0) {
        alert("No valid data found. Please check CSV format.");
        return;
    }

    // 3. Update UI
    updateKPIs();
    renderMainChart();
    updateHeader();

    // 4. Auto-zoom to All View on first load
    setTimeout(() => {
        window.zoomTime('all');
    }, 100);
}

function parseThaiDate(str) {
    // Matches "3/12/2025 9:00" followed by anything
    // Group 1: Day, Group 2: Month, Group 3: Year, Group 4: Hour, Group 5: Minute
    const match = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1; // JS Month is 0-indexed
        const year = parseInt(match[3], 10);
        const hour = parseInt(match[4], 10);
        const minute = parseInt(match[5], 10);
        return new Date(year, month, day, hour, minute);
    }
    return new Date(str); // Fallback to standard parse
}

function updateHeader() {
    if (rawData.length === 0) return;
    const start = rawData[0].date.toLocaleDateString();
    const end = rawData[rawData.length - 1].date.toLocaleDateString();
    document.getElementById('dateRange').textContent = `Data Range: ${start} - ${end} (${rawData.length} points)`;
}

function updateKPIs(startTime = null, endTime = null) {
    let dataToCalc = rawData;

    // Filter if range provided
    if (startTime !== null && endTime !== null) {
        dataToCalc = rawData.filter(d => {
            const t = d.date.getTime();
            return t >= startTime && t <= endTime;
        });
    }

    if (dataToCalc.length === 0) {
        document.getElementById('kpiPower').textContent = '-';
        document.getElementById('kpiSteam').textContent = '-';
        const val3 = document.getElementById('kpiValue3');
        if (val3) val3.textContent = '-';
        return;
    }

    const avgPower = (dataToCalc.reduce((acc, r) => acc + r.power, 0) / dataToCalc.length).toFixed(2);
    const avgSteam = (dataToCalc.reduce((acc, r) => acc + r.steam, 0) / dataToCalc.length).toFixed(2);

    document.getElementById('kpiPower').textContent = avgPower;
    document.getElementById('kpiSteam').textContent = avgSteam;

    // Dynamic KPI 3
    const selector = document.getElementById('kpiSelector3');
    const unitEl = document.getElementById('kpiUnit3');
    const valEl = document.getElementById('kpiValue3');

    if (selector && unitEl && valEl) {
        const type = selector.value;
        let val = 0;
        if (type === 'temp') {
            val = Math.max(...dataToCalc.map(r => r.tempComb)).toFixed(1);
            unitEl.textContent = '°C';
        } else if (type === 'idf') {
            val = (dataToCalc.reduce((acc, r) => acc + r.idf, 0) / dataToCalc.length).toFixed(1);
            unitEl.textContent = '%';
        } else if (type === 'rgf') {
            val = (dataToCalc.reduce((acc, r) => acc + r.rgf, 0) / dataToCalc.length).toFixed(1);
            unitEl.textContent = '%';
        }
        valEl.textContent = val;
    }
}

function renderMainChart() {
    // 1. Destroy existing chart to prevent overlaps/glitches
    if (charts.main) {
        charts.main.destroy();
    }

    const ctx = document.getElementById('mainChart').getContext('2d');

    // Dataset Configuration
    const datasets = [
        {
            label: 'Steam Flow (t/h)',
            data: rawData.map(d => ({ x: d.date, y: d.steam })),
            borderColor: COLORS.steam,
            backgroundColor: COLORS.steam,
            yAxisID: 'y_steam',
            borderWidth: 1.5,
            pointRadius: 0,
            hidden: true // Hidden by default
        },
        {
            label: 'Export Power (MW)',
            data: rawData.map(d => ({ x: d.date, y: d.power })),
            borderColor: COLORS.power,
            backgroundColor: COLORS.power,
            yAxisID: 'y_power',
            borderWidth: 1.5,
            pointRadius: 0
            // Visible by default
        },
        {
            label: 'Combustion Temp (°C)',
            data: rawData.map(d => ({ x: d.date, y: d.tempComb })),
            borderColor: COLORS.temp1,
            backgroundColor: COLORS.temp1,
            yAxisID: 'y_temp',
            borderWidth: 1.5,
            pointRadius: 0,
            hidden: true // Hidden by default
        },
        {
            label: 'IDF Running (%)',
            data: rawData.map(d => ({ x: d.date, y: d.idf })),
            borderColor: COLORS.idf,
            backgroundColor: COLORS.idf,
            yAxisID: 'y_percent',
            borderWidth: 1.5,
            pointRadius: 0,
            hidden: true // Hidden by default
        },
        {
            label: 'RGF Running (%)',
            data: rawData.map(d => ({ x: d.date, y: d.rgf })),
            borderColor: COLORS.rgf,
            backgroundColor: COLORS.rgf,
            yAxisID: 'y_percent',
            pointRadius: 0,
            hidden: true // Hidden by default
        },
        {
            label: 'Soot Blow (On/Off)',
            data: rawData
                .filter(d => d.soot === 1) // Only show active points
                .map(d => ({ x: d.date, y: 1 })), // Map to fixed height
            borderColor: COLORS.soot,
            backgroundColor: COLORS.soot,
            yAxisID: 'y_soot',
            type: 'scatter',
            pointStyle: 'crossRot',
            pointRadius: 6,
            borderWidth: 2,
            hidden: true // Hidden by default
        }
    ];

    // Customs Plugin to draw Shift Backgrounds
    const shiftBackgroundPlugin = {
        id: 'shiftBackground',
        beforeDraw: (chart) => {
            const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
            const unit = x.options.time.unit; // 'hour' or 'day'

            // Only draw in Day View
            // Check if range is approx 24h OR unit is explicitly 'hour'
            const rangeInfo = x.max - x.min;
            const isDayView = Math.abs(rangeInfo - 86400000) < 100000 || unit === 'hour';

            if (!isDayView) return;

            // Start of the visible day (approx)
            // We need to find the "start of the day" for the currently visible range
            const visibleMin = new Date(x.min);
            const startOfDay = new Date(visibleMin);
            startOfDay.setHours(0, 0, 0, 0);

            // If x.min is e.g. 23:00 of prev day, startOfDay might be prev day.
            // But our snap logic ensures we are aligned.
            // Let's iterate covering potential adjacent days if scrolling visually overlaps?
            // For simplicity, just draw for the primary day in view.

            const shifts = [
                { name: 'Shift 1 (เช้า)', start: 0, end: 8, color: 'rgba(255, 235, 59, 0.1)' },   // Yellowish
                { name: 'Shift 2 (บ่าย)', start: 8, end: 16, color: 'rgba(255, 152, 0, 0.1)' },   // Orangeish
                { name: 'Shift 3 (ดึก)', start: 16, end: 24, color: 'rgba(33, 150, 243, 0.1)' }   // Blueish
            ];

            ctx.save();

            // Draw for the 'startOfDay' based on x.min
            // In case we scroll and see 2 days, we might need a loop.
            // But since we snap to 1 day, 1 loop is enough usually.
            // Let's do a loop -1 to +1 day to be safe.

            for (let i = -1; i <= 1; i++) {
                const dayBase = new Date(startOfDay);
                dayBase.setDate(dayBase.getDate() + i);
                const baseTime = dayBase.getTime();

                shifts.forEach(shift => {
                    const t1 = baseTime + (shift.start * 3600 * 1000);
                    const t2 = baseTime + (shift.end * 3600 * 1000);

                    // Optimization: check if visible
                    if (t2 < x.min || t1 > x.max) return;

                    const startPixel = x.getPixelForValue(t1);
                    const endPixel = x.getPixelForValue(t2);
                    const width = endPixel - startPixel;

                    // Draw Rect
                    ctx.fillStyle = shift.color;
                    ctx.fillRect(startPixel, top, width, bottom - top);

                    // Draw Label (only if wide enough)
                    if (width > 50) {
                        ctx.fillStyle = '#64748b';
                        ctx.font = 'bold 12px Roboto';
                        ctx.textAlign = 'center';
                        ctx.fillText(shift.name, startPixel + width / 2, top + 20);
                    }
                });
            }

            ctx.restore();
        }
    };

    // Calculate Global Max for Scaling (Top + 5%)
    const maxSteamVal = Math.max(...rawData.map(d => d.steam));
    const maxPowerVal = Math.max(...rawData.map(d => d.power));

    charts.main = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        plugins: [shiftBackgroundPlugin],
        options: {
            // ... options ... (this is inside renderMainChart, we are appending listener after it)
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: (e, elements, chart) => {
                // If we are in 'day' unit (Week or All view), drill down to specific day
                if (chart.options.scales.x.time.unit === 'day') {
                    const canvasPosition = Chart.helpers.getRelativePosition(e, chart);
                    const clickTime = chart.scales.x.getValueForPixel(canvasPosition.x);

                    if (clickTime) {
                        // Snap to that day 00:00 - 24:00
                        const d = new Date(clickTime);
                        d.setHours(0, 0, 0, 0);

                        const min = d.getTime();
                        const max = min + (24 * 60 * 60 * 1000);

                        chart.options.scales.x.min = min;
                        chart.options.scales.x.max = max;
                        chart.options.scales.x.time.unit = 'hour';

                        chart.update();
                        updateVisibleRange(chart);
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        // Remove fixed unit to allow auto-scaling (hour -> day -> week)
                        displayFormats: {
                            hour: 'HH:mm',
                            day: 'dd/MM/yyyy',
                            month: 'MMM yyyy'
                        },
                        tooltipFormat: 'dd/MM/yyyy HH:mm'
                    },
                    grid: { color: '#e2e8f0' },
                    ticks: {
                        color: '#64748b',
                        maxRotation: 0, // Keep flat if possible
                        autoSkip: true,
                        autoSkipPadding: 20 // More space between labels
                    }
                },
                y_steam: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Steam (t/h)', color: COLORS.steam },
                    grid: { color: '#e2e8f0' },
                    suggestedMax: maxSteamVal * 1.05, // Top + 5%
                    suggestedMin: 0 // Start at 0 (or lower if negative)
                },
                y_power: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'Power (MW)', color: COLORS.power },
                    grid: { drawOnChartArea: false },
                    suggestedMax: maxPowerVal * 1.05, // Top + 5%
                    suggestedMin: 0 // Start at 0 (or lower if negative)
                },
                y_percent: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    suggestedMin: 0, // Start at 0
                    suggestedMax: 100,
                    title: { display: true, text: 'Fan Speed (%)', color: COLORS.idf },
                    grid: { drawOnChartArea: false },
                    ticks: { callback: (v) => v + '%' }
                },
                y_temp: {
                    type: 'linear',
                    display: false,
                    position: 'right',
                    grid: { drawOnChartArea: false }
                },
                y_soot: {
                    type: 'linear',
                    display: false, // Hidden axis
                    position: 'right',
                    min: 0,
                    max: 1.2, // 1 will be near top
                    grid: { drawOnChartArea: false }
                }
            },
            plugins: {
                legend: { display: false },
                zoom: {
                    zoom: {
                        wheel: { enabled: false }, // User wants wheel to PAN, not ZOOM
                        pinch: { enabled: true },
                        mode: 'x',
                    },
                    pan: {
                        enabled: true,
                        mode: 'x',
                        onPan: ({ chart }) => updateVisibleRange(chart)
                    },
                    // Removed 'limits' to allow full range viewing including padding for All view
                    zoom: {
                        wheel: { enabled: false },
                        pinch: { enabled: true },
                        mode: 'x',
                        onZoom: ({ chart }) => updateVisibleRange(chart)
                    }
                }
            }
        }
    });

    // Custom Wheel Pan Logic
    ctx.canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const chart = charts.main;
        const scale = chart.scales.x;
        const currentRange = scale.max - scale.min;
        const isDayView = Math.abs(currentRange - (24 * 60 * 60 * 1000)) < 100000; // Approx 24 hours
        // Relax Month View detection: 25 days to 35 days (covers 28, 29, 30, 31)
        const dayMs = 24 * 60 * 60 * 1000;
        const isMonthView = currentRange > (25 * dayMs) && currentRange < (35 * dayMs);

        let newMin, newMax;

        if (isDayView) {
            // SNAP LOGIC: Move by exactly 1 day (24 hours)
            const direction = Math.sign(e.deltaY); // +1 (up/right) or -1 (down/left)
            const oneDay = 24 * 60 * 60 * 1000;

            // Current Start time
            const currentStart = new Date(scale.min);
            // Snap to nearest midnight just in case, then shift
            currentStart.setHours(0, 0, 0, 0);

            let targetTime = currentStart.getTime() + (direction * oneDay); // move 1 day

            newMin = targetTime;
            newMax = targetTime + oneDay;

        } else if (isMonthView) {
            // SNAP LOGIC: Move by exactly 1 Month
            const direction = Math.sign(e.deltaY); // +1 or -1

            // Current Start time -> find First Date of that month
            const d = new Date(scale.min);
            // Go to first day of current view month
            d.setDate(1);
            d.setHours(0, 0, 0, 0);

            // Shift Month
            d.setMonth(d.getMonth() + direction);

            newMin = d.getTime();

            // Calculate Max (Start of Next Month)
            const d2 = new Date(d);
            d2.setMonth(d2.getMonth() + 1);
            newMax = d2.getTime();

        } else {
            // Default smooth scroll for Week/All/Month
            const shift = currentRange * 0.05 * Math.sign(e.deltaY);
            newMin = scale.min + shift;
            newMax = scale.max + shift;
        }

        // Optional: Clamp to data bounds (Assuming rawData is sorted)
        if (rawData.length > 0) {
            const dataMin = rawData[0].date.getTime();
            const dataMax = rawData[rawData.length - 1].date.getTime();

            // Allow scrolling as long as the VIEW overlaps with the DATA (plus a bit of margin)
            // If the view is entirely before the data, block it.
            // If the view is entirely after the data, block it.

            // Standard Intersection: Range A (newMin, newMax), Range B (dataMin, dataMax)
            // Overlap if: newMin < dataMax && newMax > dataMin
            // To be safe and allow "edge" viewing, we can use a generous buffer or strict overlap.

            // Let's use strict non-overlap to RETURN.
            // If New View End is before Data Start (with small buffer), stop.
            if (newMax < dataMin) return;

            // If New View Start is after Data End (with small buffer), stop.
            if (newMin > dataMax) return;
        }

        // Apply
        chart.options.scales.x.min = newMin;
        chart.options.scales.x.max = newMax;

        chart.update('none');
        updateVisibleRange(chart);
    });

    generateCustomLegend(charts.main);

    document.getElementById('resetZoomBtn').addEventListener('click', () => {
        window.zoomTime('all');
    });
}

// Global scope for HTML access
window.zoomTime = function (hours) {
    const chart = charts.main;
    if (!chart || rawData.length === 0) return;

    // Reset zoom plugin's internal state to allow manual scale overrides
    chart.resetZoom('none');

    const firstDataTime = rawData[0].date.getTime();
    const lastDataDate = rawData[rawData.length - 1].date;
    const lastDataTime = lastDataDate.getTime();

    // 1. Determine Anchor (Center of current view)
    let centerTime;
    const currentMin = chart.scales.x.min;
    const currentMax = chart.scales.x.max;

    // Check if we have a valid current range (within data bounds approx)
    if (currentMin && currentMax && !isNaN(currentMin)) {
        centerTime = (currentMin + currentMax) / 2;
    } else {
        // Default to end of data if no valid view yet
        centerTime = lastDataTime;
    }

    let newMin, newMax, newUnit;

    if (hours === 'all') {
        // Full Range + Padding
        const totalDuration = lastDataTime - firstDataTime;
        let pad = totalDuration * 0.01;
        if (pad < 3600000) pad = 3600000; // Min 1 hour padding

        newMin = firstDataTime - pad;
        newMax = lastDataTime + pad;
        newUnit = 'day';
    } else if (hours === 720) { // Month View
        // Anchor: Month containing the CENTER time
        const anchorDate = new Date(centerTime);

        // Start of Month
        const startOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1, 0, 0, 0, 0);
        // Start of Next Month
        const endOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1, 0, 0, 0, 0);

        newMin = startOfMonth.getTime();
        newMax = endOfMonth.getTime();
        newUnit = 'day';

    } else if (hours === 24) { // Day View
        // Anchor: Day containing the CENTER time
        const anchorDate = new Date(centerTime);
        anchorDate.setHours(0, 0, 0, 0);

        newMin = anchorDate.getTime();
        newMax = newMin + (24 * 60 * 60 * 1000);
        newUnit = 'hour';

    } else { // Week View (approx 168) or others
        // Center the week around the anchor
        const halfRange = (hours * 3600 * 1000) / 2;
        newMin = centerTime - halfRange;
        newMax = centerTime + halfRange;

        // Optional: snap start to midnight for cleaner look
        const d = new Date(newMin);
        d.setHours(0, 0, 0, 0);
        newMin = d.getTime();
        newMax = newMin + (hours * 3600 * 1000);

        newUnit = 'day';
    }

    // Apply directly to options
    chart.options.scales.x.min = newMin;
    chart.options.scales.x.max = newMax;
    chart.options.scales.x.time.unit = newUnit;

    // Remove any conflicting minUnit if it exists
    delete chart.options.scales.x.time.minUnit;

    chart.update();
    updateVisibleRange(chart);
};

function generateCustomLegend(chart) {
    const container = document.getElementById('legendToggles');
    container.innerHTML = '';

    chart.data.datasets.forEach((dataset, index) => {
        const item = document.createElement('div');
        item.className = `legend-item ${dataset.hidden ? 'hidden' : ''}`;

        const colorBox = document.createElement('div');
        colorBox.className = 'legend-color';
        colorBox.style.backgroundColor = dataset.backgroundColor;

        const label = document.createElement('span');
        label.textContent = dataset.label;

        item.appendChild(colorBox);
        item.appendChild(label);

        item.onclick = () => {
            chart.setDatasetVisibility(index, !chart.isDatasetVisible(index));
            item.classList.toggle('hidden');
            chart.update();
        };

        container.appendChild(item);
    });
}

function updateVisibleRange(chart) {
    const min = chart.scales.x.min;
    const max = chart.scales.x.max;
    if (!min || !max) return;

    const d1 = new Date(min);
    const d2 = new Date(max);

    // Format DD/MM/YYYY
    const fmt = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const dateStr = fmt(d1) + ' - ' + fmt(d2);

    document.getElementById('dateRange').textContent = `Range: ${dateStr}`;

    // Update KPIs based on visible range
    updateKPIs(min, max);
}


window.downloadChart = function () {
    const chart = charts.main;
    if (!chart) return;

    // Create a temporary canvas to add white background
    const originalCanvas = chart.canvas;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = originalCanvas.width;
    tempCanvas.height = originalCanvas.height;
    const tempCtx = tempCanvas.getContext('2d');

    // 1. Fill white background
    tempCtx.fillStyle = 'white';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // 2. Draw the chart on top
    tempCtx.drawImage(originalCanvas, 0, 0);

    // 3. Trigger download
    const link = document.createElement('a');
    link.download = 'OperationTrends.png';
    link.href = tempCanvas.toDataURL('image/png');
    link.click();
};
