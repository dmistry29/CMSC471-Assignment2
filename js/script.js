/* Course-style D3: CSV parsing, grouping, scales, SVG joins and event handlers. */
const categories = ['Abuse of Authority', 'Force', 'Discourtesy', 'Offensive Language'];
const outcomes = ['Substantiated', 'Unsubstantiated', 'Exonerated'];
const colors = { Substantiated: '#a35136', Unsubstantiated: '#c9a15e', Exonerated: '#6a7351' };
const countFormat = new Intl.NumberFormat('en-US');
const percentage = value => `${(value * 100).toFixed(1)}%`;
let records = [];
let revealed = false;
let blackOrder = [];
const tooltip = document.querySelector('#tooltip');
const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 550;

function parseRow(row) {
    const outcome = row.board_disposition.startsWith('Substantiated') ? 'Substantiated' : row.board_disposition;
    const year = Number(row.year_received);
    if (!outcomes.includes(outcome) || !categories.includes(row.fado_type) || !Number.isInteger(year)) {
        throw new Error('An unexpected outcome, category, or year was found.');
    }
    return { category: row.fado_type, outcome, year, complaint: row.complaint_id };
}

function summarize(rows) {
    const groups = d3.group(rows, d => d.category);
    return categories.map(category => {
        const group = groups.get(category) || [];
        const counts = Object.fromEntries(outcomes.map(outcome => [outcome, d3.sum(group, d => Number(d.outcome === outcome))]));
        return { category, total: group.length, counts };
    });
}

function hideTooltip() { tooltip.hidden = true; }
function showTooltip(event, lines) {
    tooltip.replaceChildren();
    lines.forEach((line, i) => {
        const element = document.createElement(i === 0 ? 'strong' : 'span');
        element.textContent = line;
        tooltip.append(element);
    });
    tooltip.hidden = false;
    positionTooltip(event);
}
function positionTooltip(event) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.type === 'focus' ? box.left + box.width / 2 : event.clientX;
    const y = event.type === 'focus' ? box.top : event.clientY;
    tooltip.style.left = `${Math.max(8, Math.min(x + 14, window.innerWidth - tooltip.offsetWidth - 8))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(y + 16, window.innerHeight - tooltip.offsetHeight - 8))}px`;
}
function addTooltip(selection, getLines) {
    selection.attr('tabindex', 0).attr('role', 'img')
        .attr('aria-label', d => getLines(d).join('. '))
        .on('pointerenter', (event, d) => showTooltip(event, getLines(d)))
        .on('pointermove', positionTooltip).on('pointerleave', hideTooltip)
        .on('focus', (event, d) => showTooltip(event, getLines(d)))
        .on('blur', hideTooltip).on('keydown', event => { if (event.key === 'Escape') hideTooltip(); });
}

function chartFrame(selector, title) {
    const width = 1040, height = 350;
    const margin = { top: 28, right: 95, bottom: 55, left: 180 };
    const svg = d3.select(selector).append('svg').attr('viewBox', `0 0 ${width} ${height}`)
        .attr('role', 'group').attr('aria-label', title);
    svg.append('title').text(title);
    const x = d3.scaleLinear().domain([0, 1]).range([margin.left, width - margin.right]);
    const y = d3.scaleBand().domain(categories).range([margin.top, height - margin.bottom]).padding(0.38);
    svg.append('g').attr('class', 'grid').attr('transform', `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).tickValues([0, .25, .5, .75, 1]).tickSize(-(height - margin.top - margin.bottom)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - margin.bottom + 8})`)
        .call(d3.axisBottom(x).tickValues([0, .25, .5, .75, 1]).tickFormat(d3.format('.0%')).tickSize(0).tickPadding(9));
    svg.append('text').attr('x', (x(0) + x(1)) / 2).attr('y', height - 5).attr('text-anchor', 'middle')
        .style('font-size', '13px').text('Share of allegation records within category');
    svg.append('g').attr('class', 'marks');
    svg.append('g').attr('class', 'row-labels');
    svg.append('g').attr('class', 'value-labels');
    return { svg, x, y, width, margin };
}

let whiteFrame, blackFrame;
function renderWhite() {
    hideTooltip();
    const selected = document.querySelector('#year-select').value;
    const filtered = selected === 'all' ? records : records.filter(d => d.year === Number(selected));
    const summaries = summarize(filtered);
    const { svg, x, y } = whiteFrame;
    const segments = [];
    summaries.forEach(row => {
        let start = 0;
        outcomes.forEach(outcome => {
            const share = row.total ? row.counts[outcome] / row.total : 0;
            segments.push({ ...row, outcome, count: row.counts[outcome], share, start, end: start + share });
            start += share;
        });
    });
    svg.select('.row-labels').selectAll('text').data(summaries).join('text')
        .attr('x', x(0) - 14).attr('y', d => y(d.category) + y.bandwidth() / 2 + 5)
        .attr('text-anchor', 'end').text(d => d.category);
    const bars = svg.select('.marks').selectAll('rect').data(segments, d => `${d.category}-${d.outcome}`).join('rect')
        .attr('fill', d => colors[d.outcome]).attr('y', d => y(d.category)).attr('height', y.bandwidth())
        .attr('tabindex', d => d.count ? 0 : -1);
    addTooltip(bars, d => [d.category, d.outcome, `${countFormat.format(d.count)} of ${countFormat.format(d.total)} records (${percentage(d.share)})`]);
    bars.attr('tabindex', d => d.count ? 0 : -1).interrupt().transition().duration(duration)
        .attr('x', d => x(d.start)).attr('width', d => x(d.end) - x(d.start));
    svg.select('.value-labels').selectAll('.segment-label').data(segments).join('text').attr('class', 'segment-label')
        .attr('x', d => x((d.start + d.end) / 2)).attr('y', d => y(d.category) + y.bandwidth() / 2 + 5)
        .attr('text-anchor', 'middle').text(d => d.share >= .075 ? percentage(d.share) : '');
    svg.select('.value-labels').selectAll('.total-label').data(summaries).join('text').attr('class', 'total-label')
        .attr('x', x(1) + 15).attr('y', d => y(d.category) + y.bandwidth() / 2 + 5)
        .style('font-size', '14px').text(d => d.total ? `n = ${countFormat.format(d.total)}` : 'No records');
    const years = selected === 'all' ? 'All years received · 1985–2020' : `Received in ${selected}`;
    document.querySelector('#white-subtitle').textContent = `${years} · ${countFormat.format(filtered.length)} allegation records`;
    document.querySelector('#filter-summary').textContent = `${new Set(filtered.map(d => d.complaint)).size.toLocaleString('en-US')} distinct complaint IDs in this selection. All substantiated subtypes are combined; other outcomes stay separate.${selected === '2020' ? ' 2020 is incomplete in this release.' : ''}`;
}

function renderBlack() {
    hideTooltip();
    const summaries = summarize(records);
    const { svg, x, y } = blackFrame;
    y.domain(blackOrder);
    const data = blackOrder.map(category => summaries.find(d => d.category === category)).map(row => {
        const count = row.counts.Exonerated + (revealed ? 0 : row.counts.Unsubstantiated);
        return { ...row, count, share: count / row.total };
    });
    svg.attr('aria-label', revealed ? 'Corrected view: exonerated allegation records by category' : 'Intentionally misleading view: combined outcomes labeled cleared');
    svg.select('title').text(svg.attr('aria-label'));
    svg.select('.row-labels').selectAll('text').data(data).join('text')
        .attr('x', x(0) - 14).attr('y', d => y(d.category) + y.bandwidth() / 2 + 5)
        .attr('text-anchor', 'end').text(d => d.category);
    const bars = svg.select('.marks').selectAll('rect').data(data, d => d.category).join('rect')
        .attr('x', x(0)).attr('y', d => y(d.category)).attr('height', y.bandwidth()).attr('fill', colors.Exonerated);
    addTooltip(bars, d => [d.category, revealed ? 'Exonerated' : '“Cleared” (misleading combined label)', `${countFormat.format(d.count)} of ${countFormat.format(d.total)} records (${percentage(d.share)})`, ...(revealed ? [] : ['Combines exonerated and unsubstantiated.'])]);
    bars.interrupt().transition().duration(duration).attr('width', d => x(d.share) - x(0));
    svg.select('.value-labels').selectAll('text').data(data, d => d.category).join('text')
        .attr('y', d => y(d.category) + y.bandwidth() / 2 + 5).attr('font-weight', 'bold')
        .text(d => percentage(d.share)).interrupt().transition().duration(duration).attr('x', d => x(d.share) + 12);
    const total = d3.sum(data, d => d.count) / records.length;
    document.querySelector('#black-stat').textContent = percentage(total);
    document.querySelector('#black-stat-label').textContent = revealed ? 'exonerated overall' : '“cleared” overall';
    document.querySelector('#black-title').textContent = revealed ? 'Fewer than three in ten were exonerated.' : 'Three in four allegations clear officers.';
    document.querySelector('#black-deck').textContent = revealed ? 'The other 46.3% were unsubstantiated: the evidence did not resolve whether misconduct occurred.' : 'Across allegation categories, the majority end without a finding of misconduct.';
    document.querySelector('#black-footnote').textContent = revealed ? 'Share exonerated by allegation category · Same records, order, and denominator' : 'Share “cleared” by allegation category · All records in the supplied release';
    document.querySelector('#reveal-note').hidden = !revealed;
    const button = document.querySelector('#reveal-button');
    button.textContent = revealed ? 'Restore the misleading framing ↩' : 'Reveal the missing distinction ↗';
    button.setAttribute('aria-pressed', String(revealed));
}

async function init() {
    if (typeof d3 === 'undefined') throw new Error('D3 could not load. Check your internet connection.');
    records = await d3.csv('data/allegations_202007271729.csv', parseRow);
    if (!records.length) throw new Error('The CSV contains no allegation records.');
    whiteFrame = chartFrame('#white-chart', 'White hat: substantiated, unsubstantiated, and exonerated allegation shares by category');
    blackFrame = chartFrame('#black-chart', 'Black hat: a deliberately misleading grouping of investigation outcomes');
    blackOrder = summarize(records).sort((a, b) => (b.counts.Exonerated + b.counts.Unsubstantiated) / b.total - (a.counts.Exonerated + a.counts.Unsubstantiated) / a.total).map(d => d.category);
    d3.select('#year-select').selectAll('option.year').data([...new Set(records.map(d => d.year))].sort((a, b) => a - b)).join('option')
        .attr('class', 'year').attr('value', d => d).text(d => d === 2020 ? '2020 · partial year' : d);
    document.querySelector('#year-select').disabled = false;
    document.querySelector('#year-select').addEventListener('change', renderWhite);
    document.querySelector('#reveal-button').disabled = false;
    document.querySelector('#reveal-button').addEventListener('click', () => { revealed = !revealed; renderBlack(); });
    renderWhite(); renderBlack();
}
init().catch(error => {
    console.error(error);
    document.querySelector('#white-subtitle').textContent = 'Unable to load the visualization.';
    for (const id of ['white-chart', 'black-chart']) {
        const message = document.createElement('p');
        message.className = 'error';
        message.textContent = `The chart could not load. Serve this folder through a local web server (such as VS Code Live Server) and check your connection to the D3 CDN. ${error.message}`;
        document.getElementById(id).replaceChildren(message);
    }
});
