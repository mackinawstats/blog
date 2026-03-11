/* ================================================================
   SCROLLY ENGINE  v1.0
   ----------------------------------------------------------------
   Reads three globals set in the article's <script> block:

     DATA          array of objects — your dataset
     CHART_CONFIG  object — axis keys, colors, chart type
     CHART_STEPS   array — what the chart does at each step

   Depends on (loaded via CDN before this file):
     • D3 v7   https://d3js.org/d3.v7.min.js
     • Scrollama  https://unpkg.com/scrollama

   Called automatically on DOMContentLoaded.
   ================================================================ */

(function () {
  'use strict';

  /* ── Merge article config with sensible defaults ─────────────── */
  const cfg = Object.assign({
    type:           'bar',   // 'bar' | 'line' | 'scatter'
    xKey:           'label', // key in DATA objects for x-axis
    yKey:           'value', // key in DATA objects for y-axis
    color:          '#c0392b',
    highlightColor: '#c0392b',
    dimColor:       '#d9cfc2',
    axisColor:      '#888',
    gridColor:      '#e0dbd0',
  }, window.CHART_CONFIG || {});

  const data  = window.DATA        || [];
  const steps = window.CHART_STEPS || [];

  /* ── DOM refs ───────────────────────────────────────────────── */
  const chartEl    = document.getElementById('chart-container');
  const captionEl  = document.querySelector('.chart-caption');
  const dotsEl     = document.querySelector('.step-dots');
  const stepEls    = Array.from(document.querySelectorAll('.step'));

  /* ── Build progress dots ─────────────────────────────────────── */
  if (dotsEl && steps.length) {
    steps.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = 'step-dot';
      dot.dataset.step = i;
      dotsEl.appendChild(dot);
    });
  }

  function setActiveDot(index) {
    if (!dotsEl) return;
    dotsEl.querySelectorAll('.step-dot').forEach((d, i) => {
      d.classList.toggle('is-active', i === index);
    });
  }

  /* ================================================================
     CHART
     ================================================================ */
  let svg, g, xScale, yScale, bars, line, dots, annotGroup;
  let W, H;

  const M = { top: 24, right: 24, bottom: 52, left: 48 };

  /* Compute inner dimensions from the container */
  function dims() {
    const rect = chartEl.getBoundingClientRect();
    return {
      W: Math.floor(rect.width)  - M.left - M.right,
      H: Math.floor(rect.height) - M.top  - M.bottom,
    };
  }

  /* ── Build the SVG skeleton ─────────────────────────────────── */
  function initChart() {
    if (!chartEl || !data.length) return;

    ({ W, H } = dims());

    svg = d3.select('#chart-container')
      .append('svg')
        .attr('width',  '100%')
        .attr('height', '100%')
        .attr('aria-hidden', 'true');

    g = svg.append('g')
      .attr('transform', `translate(${M.left},${M.top})`);

    /* ── Scales ── */
    if (cfg.type === 'bar') {
      xScale = d3.scaleBand()
        .domain(data.map(d => d[cfg.xKey]))
        .range([0, W])
        .padding(0.35);
    } else {
      // line or scatter: numeric or time x-axis
      const xVals = data.map(d => d[cfg.xKey]);
      xScale = (typeof xVals[0] === 'number' ? d3.scaleLinear() : d3.scalePoint())
        .domain(typeof xVals[0] === 'number' ? d3.extent(xVals) : xVals)
        .range([0, W]);
    }

    const _yMax = cfg.yMax !== undefined ? cfg.yMax : d3.max(data, d => d[cfg.yKey]) * 1.18;
    const _yMin = cfg.yMin !== undefined ? cfg.yMin : 0;
    yScale = d3.scaleLinear()
      .domain([_yMin, _yMax])
      .range([H, 0])
      .nice();

    /* ── Grid lines ── */
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3.axisLeft(yScale)
          .ticks(5)
          .tickSize(-W)
          .tickFormat('')
      )
      .call(sel => sel.select('.domain').remove())
      .call(sel => sel.selectAll('line')
        .attr('stroke', cfg.gridColor)
        .attr('stroke-dasharray', '3,3'));

    /* ── Axes ── */
    const xAxis = g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${H})`)
      .call(d3.axisBottom(xScale).tickSizeOuter(0));

    xAxis.select('.domain').attr('stroke', cfg.gridColor);
    xAxis.selectAll('text')
      .style('font-family', 'var(--font-sans, system-ui)')
      .style('font-size',   '0.75rem')
      .style('fill',        cfg.axisColor)
      .attr('dy', '1.2em');
    xAxis.selectAll('.tick line').remove();

    const yAxis = g.append('g')
      .attr('class', 'y-axis')
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(cfg.yFormat ? d3.format(cfg.yFormat) : d3.format(',.0f')));

    yAxis.select('.domain').remove();
    yAxis.selectAll('text')
      .style('font-family', 'var(--font-sans, system-ui)')
      .style('font-size',   '0.75rem')
      .style('fill',        cfg.axisColor);
    yAxis.selectAll('.tick line').remove();

    /* ── Draw data marks ── */
    if (cfg.type === 'bar') {
      bars = g.selectAll('.bar')
        .data(data)
        .join('rect')
          .attr('class', 'bar')
          .attr('x',      d => xScale(d[cfg.xKey]))
          .attr('width',  xScale.bandwidth())
          .attr('y',      H)
          .attr('height', 0)
          .attr('rx',     2)
          .attr('fill',   cfg.color);

      /* Entrance animation */
      bars.transition()
        .duration(700)
        .delay((_, i) => i * 60)
        .ease(d3.easeCubicOut)
        .attr('y',      d => yScale(d[cfg.yKey]))
        .attr('height', d => H - yScale(d[cfg.yKey]));

    } else if (cfg.type === 'line') {
      const lineGen = d3.line()
        .x(d => (cfg.type === 'line' ? xScale(d[cfg.xKey]) : xScale(d[cfg.xKey])))
        .y(d => yScale(d[cfg.yKey]))
        .curve(d3.curveMonotoneX);

      line = g.append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', cfg.color)
        .attr('stroke-width', 2.5)
        .attr('stroke-linejoin', 'round')
        .attr('d', lineGen);

      const totalLength = line.node().getTotalLength();
      line
        .attr('stroke-dasharray', totalLength)
        .attr('stroke-dashoffset', totalLength)
        .transition().duration(1000).ease(d3.easeLinear)
        .attr('stroke-dashoffset', 0);

      dots = g.selectAll('.dot')
        .data(data)
        .join('circle')
          .attr('class', 'dot')
          .attr('cx', d => xScale(d[cfg.xKey]))
          .attr('cy', d => yScale(d[cfg.yKey]))
          .attr('r', 4)
          .attr('fill', cfg.color)
          .attr('stroke', '#fff')
          .attr('stroke-width', 2);

    } else if (cfg.type === 'scatter') {
      dots = g.selectAll('.dot')
        .data(data)
        .join('circle')
          .attr('class', 'dot')
          .attr('cx', d => xScale(d[cfg.xKey]))
          .attr('cy', d => yScale(d[cfg.yKey]))
          .attr('r', 0)
          .attr('fill', cfg.color)
          .attr('opacity', 0.75);

      dots.transition().duration(600).delay((_, i) => i * 30)
        .attr('r', 6);
    }

    /* Annotation group (drawn last so it's on top) */
    annotGroup = g.append('g').attr('class', 'annotations');
  }

  /* ── Update the chart for a given step index ─────────────────── */
  function updateChart(stepIndex) {
    if (!svg) return;

    const step       = steps[stepIndex] || {};
    const highlight  = step.highlight  || null; // array of xKey values, or null
    const annotation = step.annotation || null; // { label, text } or null
    const caption    = step.caption    || '';
    const t          = d3.transition().duration(450).ease(d3.easeCubicInOut);

    /* ── Highlight / dim bars ── */
    if (bars) {
      bars.transition(t)
        .attr('fill', d => {
          if (!highlight) return cfg.color;
          return highlight.includes(d[cfg.xKey]) ? cfg.highlightColor : cfg.dimColor;
        })
        .attr('opacity', d => {
          if (!highlight) return 1;
          return highlight.includes(d[cfg.xKey]) ? 1 : 0.45;
        });
    }

    /* ── Highlight / dim scatter/line dots ── */
    if (dots) {
      dots.transition(t)
        .attr('fill', d => {
          if (!highlight) return cfg.color;
          return highlight.includes(d[cfg.xKey]) ? cfg.highlightColor : cfg.dimColor;
        })
        .attr('opacity', d => {
          if (!highlight) return 0.75;
          return highlight.includes(d[cfg.xKey]) ? 1 : 0.3;
        })
        .attr('r', d => {
          if (!highlight) return 6;
          return highlight.includes(d[cfg.xKey]) ? 8 : 5;
        });
    }

    /* ── Annotation callout ── */
    annotGroup.selectAll('*').remove();

    if (annotation) {
      const datum = data.find(d => d[cfg.xKey] === annotation.label);
      if (datum) {
        const cx = cfg.type === 'bar'
          ? xScale(datum[cfg.xKey]) + xScale.bandwidth() / 2
          : xScale(datum[cfg.xKey]);
        const cy = yScale(datum[cfg.yKey]);

        /* Vertical stem */
        annotGroup.append('line')
          .attr('x1', cx).attr('y1', cy - 6)
          .attr('x2', cx).attr('y2', cy - 24)
          .attr('stroke', cfg.color)
          .attr('stroke-width', 1.5);

        /* Label pill */
        const txt = annotGroup.append('text')
          .attr('x', cx)
          .attr('y', cy - 30)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'auto')
          .style('font-family', 'var(--font-sans, system-ui)')
          .style('font-size',   '0.72rem')
          .style('font-weight', '600')
          .style('fill',        cfg.color)
          .text(annotation.text);

        /* Background rect (inserted before text in DOM) */
        const bb = txt.node().getBBox();
        annotGroup.insert('rect', 'text')
          .attr('x',      bb.x - 6)
          .attr('y',      bb.y - 3)
          .attr('width',  bb.width  + 12)
          .attr('height', bb.height + 6)
          .attr('rx', 3)
          .attr('fill', '#f5f0e8');

        /* Fade in */
        annotGroup.selectAll('*')
          .style('opacity', 0)
          .transition(t)
          .style('opacity', 1);
      }
    }

    /* ── Caption ── */
    if (captionEl) {
      captionEl.style.opacity = '0';
      setTimeout(() => {
        captionEl.textContent = caption;
        captionEl.style.opacity = '1';
      }, 200);
    }
  }

  /* ================================================================
     SCROLLAMA SETUP
     ================================================================ */
  function initScrolly() {
    const scroller = scrollama();

    scroller
      .setup({
        step:   '.step',
        offset: 0.5,  // trigger when step midpoint crosses viewport midpoint
        debug:  false,
      })
      .onStepEnter(({ index }) => {
        stepEls.forEach((el, i) => el.classList.toggle('is-active', i === index));
        setActiveDot(index);
        updateChart(index);
      });

    /* Re-calculate on resize */
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => scroller.resize(), 150);
    });
  }

  /* ================================================================
     BOOT
     ================================================================ */
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof d3 === 'undefined') {
      console.error('[scrolly-engine] D3 is not loaded. Add it before scrolly-engine.js.');
      return;
    }
    if (typeof scrollama === 'undefined') {
      console.error('[scrolly-engine] Scrollama is not loaded. Add it before scrolly-engine.js.');
      return;
    }

    initChart();
    initScrolly();

    /* Show first step immediately */
    if (stepEls.length) stepEls[0].classList.add('is-active');
    setActiveDot(0);
    updateChart(0);
  });

})();
