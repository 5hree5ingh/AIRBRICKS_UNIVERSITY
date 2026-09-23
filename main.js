/* =========================================================
   AIRBRICK — interactions
   ========================================================= */
(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = !!(window.gsap && window.ScrollTrigger);
  const isDesktop = () => window.matchMedia('(min-width: 901px)').matches;

  /* ---------- Smooth scrolling (Lenis) ---------- */
  let lenis = null;
  if (window.Lenis && !reduced) {
    lenis = new Lenis({ duration: 1.25, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    if (hasGsap) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }

  const scrollTo = (target, offset = -20) => {
    if (lenis) lenis.scrollTo(target, { offset, duration: 1.6 });
    else (typeof target === 'number' ? window.scrollTo({ top: target, behavior: 'smooth' }) : target.scrollIntoView({ behavior: 'smooth' }));
  };

  $$('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if (id.length < 2 && id !== '#') return;
      const el = id === '#top' || id === '#' ? 0 : $(id);
      if (el === null) return;
      e.preventDefault();
      closeMenu();
      // The form sits under the fixed nav, so leave room for it
      scrollTo(el, id === '#enquire' ? -110 : -20);
    });
  });

  /* ---------- Nav ---------- */
  const nav = $('#nav');
  let lastY = 0;
  const onScroll = y => {
    nav.classList.toggle('is-scrolled', y > 40);
    nav.classList.toggle('is-hidden', y > lastY && y > 400 && !document.body.classList.contains('menu-open'));
    lastY = y;
  };
  if (lenis) lenis.on('scroll', e => onScroll(e.scroll));
  else window.addEventListener('scroll', () => onScroll(window.scrollY), { passive: true });

  const burger = $('.nav__burger');
  function closeMenu() {
    document.body.classList.remove('menu-open');
    burger.setAttribute('aria-expanded', 'false');
    $('.menu').setAttribute('aria-hidden', 'true');
    lenis && lenis.start();
  }
  burger.addEventListener('click', () => {
    const open = !document.body.classList.contains('menu-open');
    if (!open) return closeMenu();
    document.body.classList.add('menu-open');
    burger.setAttribute('aria-expanded', 'true');
    $('.menu').setAttribute('aria-hidden', 'false');
    lenis && lenis.stop();
  });

  /* ---------- Split headings into masked words ---------- */
  $$('.split').forEach(el => {
    const walk = (node, into) => {
      node.childNodes.forEach(child => {
        if (child.nodeType === 3) {
          child.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { into.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span'); w.className = 'w';
            const i = document.createElement('span'); i.textContent = part;
            w.appendChild(i); into.appendChild(w);
          });
        } else if (child.nodeType === 1) {
          const clone = child.cloneNode(false);
          walk(child, clone);
          into.appendChild(clone);
        }
      });
    };
    const frag = document.createDocumentFragment();
    walk(el, frag);
    el.innerHTML = '';
    el.appendChild(frag);
  });

  /* ---------- Loader + intro ---------- */
  const loader = $('.loader');
  // The hero slideshow starts only once the loader lifts
  const ready = () => { document.documentElement.classList.add('is-ready'); startHero(); };
  const intro = () => {
    if (!hasGsap || reduced) { loader && loader.remove(); ready(); return; }
    const tl = gsap.timeline();
    tl.from('.loader__mark', { y: 16, opacity: 0, duration: 1, ease: 'power3.out' })
      .to('.loader__bar i', { scaleX: 1, duration: 0.9, ease: 'power2.inOut' }, '-=0.4')
      .add(ready)
      .to('.loader', { clipPath: 'inset(0 0 100% 0)', duration: 1, ease: 'expo.inOut' })
      .add(() => loader.remove())
      .from('.hero__title .w > span', { yPercent: 110, duration: 1.1, stagger: 0.06, ease: 'expo.out', clearProps: 'transform' }, '-=0.7')
      .from('.hero__lead, .hero__link', { y: 24, opacity: 0, duration: 1, stagger: 0.1, ease: 'power3.out', clearProps: 'transform,opacity' }, '-=0.9')
      .from('.enquiry', { y: 50, opacity: 0, duration: 1.2, ease: 'expo.out', clearProps: 'transform,opacity' }, '-=1')
      .from('.nav__inner', { y: -20, opacity: 0, duration: 0.8, ease: 'power3.out' }, '-=1.3');
    gsap.set('.loader', { clipPath: 'inset(0 0 0% 0)' });
  };
  if (loader && lenis) lenis.stop();
  const begin = () => { intro(); setTimeout(() => lenis && !document.body.classList.contains('menu-open') && lenis.start(), 2200); };
  // setTimeout lets the slideshow code below finish setting up first
  if (document.readyState === 'complete') setTimeout(begin); else window.addEventListener('load', begin);
  // Never let the loader hang on a slow network
  setTimeout(() => { if (document.body.contains(loader)) { loader.remove(); ready(); lenis && lenis.start(); } }, 6000);

  /* ---------- Hero slideshow ---------- */
  const HERO_FADE = 2200;  // must match the opacity transition in styles.css
  const HERO_DELAY = 6500; // time each photo holds before the next one dissolves in
  let heroTimer = null;
  let heroBusy = false;
  let heroIndex = 0;
  const heroSlides = $$('.hero__slide');

  // Photos load one step ahead, so the page doesn't download every image up front
  const loadSlide = slide => {
    const img = $('img', slide);
    if (img.dataset.src) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
    // Wait for the photo to be ready, but never stall the slideshow on a slow one
    const decoded = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
    return Promise.race([decoded, new Promise(r => setTimeout(r, 1500))]);
  };

  async function heroGo(n) {
    if (heroBusy || heroSlides.length < 2) return;
    n = (n + heroSlides.length) % heroSlides.length;
    if (n === heroIndex) return;
    heroBusy = true;
    await loadSlide(heroSlides[n]);
    const prev = heroSlides[heroIndex];
    const next = heroSlides[n];
    // The outgoing photo stays fully opaque underneath, so the dissolve never dips in brightness
    heroSlides.forEach(s => s.classList.remove('is-prev'));
    prev.classList.remove('is-active');
    prev.classList.add('is-prev');
    // Restart the incoming photo's zoom from the beginning
    const img = next.querySelector('img');
    img.style.animation = 'none';
    void img.offsetWidth;
    img.style.animation = '';
    next.classList.add('is-active');
    heroIndex = n;
    loadSlide(heroSlides[(n + 1) % heroSlides.length]);
    setTimeout(() => {
      prev.classList.remove('is-prev');
      heroBusy = false;
    }, HERO_FADE);
  }

  function heroPlay() {
    clearInterval(heroTimer);
    if (!reduced) heroTimer = setInterval(() => heroGo(heroIndex + 1), HERO_DELAY);
  }

  let heroStarted = false;
  function startHero() {
    if (heroStarted || !heroSlides.length) return;
    heroStarted = true;
    loadSlide(heroSlides[1 % heroSlides.length]);
    heroPlay();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearInterval(heroTimer); else if (heroStarted) heroPlay();
  });

  // Left / right arrow keys step through the hero photos (handy for comparing them)
  window.addEventListener('keydown', e => {
    const typing = e.target.closest && e.target.closest('input, select, textarea');
    if (!heroStarted || typing || document.querySelector('.lightbox.is-open')) return;
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    heroGo(heroIndex + (e.key === 'ArrowRight' ? 1 : -1));
    heroPlay();
  });

  /* ---------- Scroll animations ---------- */
  if (hasGsap && !reduced) {
    gsap.registerPlugin(ScrollTrigger);

    $$('.split').forEach(el => {
      if (el.closest('.hero')) return;
      gsap.from($$('.w > span', el), {
        yPercent: 110, duration: 1.1, stagger: 0.05, ease: 'expo.out', clearProps: 'transform',
        scrollTrigger: { trigger: el, start: 'top 85%' }
      });
    });

    // Stagger groups
    ['.services', '.steps', '.stats'].forEach(sel => {
      const kids = $$(`${sel} > *`);
      kids.forEach(k => k.removeAttribute('data-reveal'));
      gsap.from(kids, { y: 50, opacity: 0, duration: 1, stagger: 0.1, ease: 'power3.out', clearProps: 'transform,opacity', scrollTrigger: { trigger: sel, start: 'top 85%' } });
    });

    $$('[data-reveal]').forEach(el => {
      if (el.closest('.hero')) return;
      gsap.from(el, { y: 40, opacity: 0, duration: 1.1, ease: 'power3.out', clearProps: 'transform,opacity', scrollTrigger: { trigger: el, start: 'top 88%' } });
    });

    $$('[data-reveal-img]').forEach(el => {
      if (el.closest('.hero')) return;
      gsap.from(el, { clipPath: 'inset(12% 6% 12% 6% round 28px)', duration: 1.5, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 85%' } });
    });

    $$('[data-parallax]').forEach(img => {
      gsap.fromTo(img, { yPercent: -10 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
    });

    // Hero image drift
    gsap.to('.hero__media', { yPercent: 12, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

    // Big word
    gsap.fromTo('.bigword__text', { xPercent: 2 }, { xPercent: -2, ease: 'none', scrollTrigger: { trigger: '.bigword', start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.fromTo('.bigword__frame', { scale: 0.86, borderRadius: 60 }, { scale: 1, borderRadius: 28, ease: 'none', scrollTrigger: { trigger: '.bigword__frame', start: 'top 95%', end: 'top 30%', scrub: true } });
    gsap.fromTo('.bigword__frame img', { yPercent: -12 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.bigword__frame', start: 'top bottom', end: 'bottom top', scrub: true } });

    // CTA
    gsap.from('.cta__box', { y: 60, opacity: 0, duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: '.cta', start: 'top 85%' } });
    gsap.fromTo('.cta__media img', { scale: 1.2 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.cta', start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.from('.footer__word', { yPercent: 40, opacity: 0, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '.footer__word', start: 'top 95%' } });

    // Horizontal projects (desktop)
    const mm = gsap.matchMedia();
    mm.add('(min-width: 901px)', () => {
      const track = $('.work__track');
      const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
      const tween = gsap.to(track, {
        x: () => -dist(), ease: 'none',
        // whole pixels keep card text sharp while the track moves
        modifiers: { x: gsap.utils.unitize(x => Math.round(parseFloat(x))) },
        scrollTrigger: {
          trigger: '.work', pin: '.work__pin', start: 'top top',
          end: () => '+=' + dist(), scrub: 1, invalidateOnRefresh: true,
          onUpdate: self => gsap.set('.work__bar i', { scaleX: 0.08 + self.progress * 0.92 })
        }
      });
      $$('.card__media img').forEach(img => {
        gsap.fromTo(img, { xPercent: 0, scale: 1.15 }, { xPercent: -6, scale: 1.15, ease: 'none', scrollTrigger: { trigger: img.parentElement, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } });
      });
    });

    // Counters
    $$('[data-count]').forEach(el => {
      const end = parseFloat(el.dataset.count);
      const dec = parseInt(el.dataset.decimals || '0', 10);
      const o = { v: 0 };
      gsap.to(o, { v: end, duration: 2, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 90%' }, onUpdate: () => { el.textContent = o.v.toFixed(dec); } });
    });

    window.addEventListener('load', () => ScrollTrigger.refresh());
  } else {
    $$('[data-count]').forEach(el => { el.textContent = el.dataset.count; });
  }

  // Mobile: sync progress bar with native horizontal scroll
  const vp = $('.work__viewport');
  vp.addEventListener('scroll', () => {
    const p = vp.scrollLeft / Math.max(1, vp.scrollWidth - vp.clientWidth);
    $('.work__bar i').style.transform = `scaleX(${0.08 + p * 0.92})`;
  }, { passive: true });

  /* ---------- Experience section: 3D model, with a flat-photo pan as fallback ---------- */
  const pano = $('.pano');
  const panoImg = $('.pano__img');
  const compass = $('.pano__compass');
  const compassIcon = $('i', compass);
  const panoHint = $('.pano__hint');
  const model = $('#campusModel');
  const defaultOrbit = model && model.getAttribute('camera-orbit');

  // model/campus.glb doesn't exist until the user adds it — model-viewer just fires
  // 'error' in that case, and the section quietly stays on the photo fallback below.
  if (model) {
    model.addEventListener('load', () => {
      pano.classList.add('is-3d');
      panoHint.innerHTML = '<i class="ph-light ph-hand-grabbing"></i>Drag to orbit';
      compassIcon.style.transform = '';
      compassIcon.className = 'ph-light ph-arrow-counter-clockwise';
      compass.setAttribute('aria-label', 'Reset view');
      compass.classList.add('pano__compass--reset');
    });
    compass.addEventListener('click', () => {
      if (!pano.classList.contains('is-3d')) return;
      model.cameraOrbit = defaultOrbit;
      model.fieldOfView = 'auto';
    });
  }

  let bgW = 0, pos = 0, target = 0, dragging = false, startX = 0, startPos = 0, dir = -1, lastInteract = 0;
  const sizePano = () => {
    const h = pano.clientHeight, w = pano.clientWidth;
    bgW = Math.max(w * 1.9, h * (16 / 9));
    panoImg.style.backgroundSize = `${bgW}px auto`;
    const minPos = w - bgW;
    if (!pos) pos = target = minPos / 2;
    pos = target = Math.min(0, Math.max(minPos, target));
  };
  sizePano();
  window.addEventListener('resize', sizePano);
  // Once the 3D model is live it owns pointer input, so the photo-pan step aside entirely
  const is3d = () => pano.classList.contains('is-3d');
  pano.addEventListener('pointerdown', e => { if (is3d()) return; dragging = true; startX = e.clientX; startPos = target; pano.setPointerCapture(e.pointerId); lastInteract = performance.now(); });
  pano.addEventListener('pointermove', e => { if (is3d() || !dragging) return; target = startPos + (e.clientX - startX) * 1.4; lastInteract = performance.now(); });
  const endDrag = () => { dragging = false; };
  pano.addEventListener('pointerup', endDrag);
  pano.addEventListener('pointercancel', endDrag);
  const panoLoop = now => {
    if (is3d()) { requestAnimationFrame(panoLoop); return; }
    const minPos = pano.clientWidth - bgW;
    if (!dragging && !reduced && now - lastInteract > 2500) {
      target += dir * 0.35;
      if (target <= minPos) dir = 1;
      if (target >= 0) dir = -1;
    }
    target = Math.min(0, Math.max(minPos, target));
    pos += (target - pos) * 0.08;
    panoImg.style.backgroundPosition = `${pos}px center`;
    if (minPos < 0) compassIcon.style.transform = `rotate(${(pos / minPos - 0.5) * 120}deg)`;
    requestAnimationFrame(panoLoop);
  };
  requestAnimationFrame(panoLoop);

  /* ---------- Cursor ---------- */
  const cursor = $('.cursor');
  if (window.matchMedia('(pointer: fine)').matches && cursor) {
    const label = $('.cursor__label');
    let cx = innerWidth / 2, cy = innerHeight / 2, x = cx, y = cy;
    window.addEventListener('pointermove', e => { cx = e.clientX; cy = e.clientY; cursor.classList.add('is-visible'); }, { passive: true });
    document.addEventListener('mouseleave', () => cursor.classList.remove('is-visible'));
    const loop = () => { x += (cx - x) * 0.2; y += (cy - y) * 0.2; cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`; requestAnimationFrame(loop); };
    loop();
    $$('[data-cursor]').forEach(el => {
      el.addEventListener('mouseenter', () => { label.textContent = el.dataset.cursor === 'drag' ? 'Drag' : 'View'; cursor.classList.add('is-view'); });
      el.addEventListener('mouseleave', () => cursor.classList.remove('is-view'));
    });
  }

  /* ---------- Lightbox ---------- */
  const lb = $('.lightbox');
  const lbImg = $('img', lb);
  const lbTitle = $('figcaption b', lb);
  const lbMeta = $('figcaption span', lb);
  const cards = $$('.card[data-index]');
  let current = 0;
  const render = n => {
    current = (n + cards.length) % cards.length;
    const c = cards[current];
    const img = $('img', c);
    lbImg.src = img.src; lbImg.alt = img.alt;
    lbTitle.textContent = $('h3', c).textContent;
    lbMeta.textContent = $('p', c).innerHTML.split('<br>')[0].replace('&amp;', '&');
  };
  const openLb = n => { render(n); lb.classList.add('is-open'); lb.setAttribute('aria-hidden', 'false'); lenis && lenis.stop(); };
  const closeLb = () => { lb.classList.remove('is-open'); lb.setAttribute('aria-hidden', 'true'); lenis && lenis.start(); };
  cards.forEach((c, n) => $('.card__media', c).addEventListener('click', () => openLb(n)));
  $('.lightbox__close').addEventListener('click', closeLb);
  $('.lightbox__prev').addEventListener('click', () => render(current - 1));
  $('.lightbox__next').addEventListener('click', () => render(current + 1));
  lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
  window.addEventListener('keydown', e => {
    if (!lb.classList.contains('is-open')) { if (e.key === 'Escape') closeMenu(); return; }
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowRight') render(current + 1);
    if (e.key === 'ArrowLeft') render(current - 1);
  });

  /* ---------- Enquiry form ---------- */
  // Paste your form backend URL here (Formspree, Google Apps Script, CRM webhook…) to receive leads.
  // While it is empty, the form validates and shows the thank-you state but sends nothing.
  const FORM_ENDPOINT = '';

  const form = $('.enquiry__form');
  if (form) {
    const success = $('.enquiry__success');
    const errorMsg = $('.enquiry__error', form);
    const submit = $('.enquiry__submit', form);
    const submitLabel = $('.enquiry__submit-label', form);
    const filled = (min, msg) => v => v.trim().length >= min || msg;
    const rules = {
      institution: filled(2, 'Please enter your institution'),
      fullname: filled(2, 'Please enter your name'),
      role: filled(2, 'Please enter your role'),
      email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Enter a valid email address',
      mobile: v => /^\+?[0-9]{10,15}$/.test(v.replace(/[\s()-]/g, '')) || 'Enter a valid phone number',
      city: v => !!v || 'Select a city',
      cohort: v => !!v || 'Select a timing',
      capacity: v => !!v || 'Select a capacity',
    };
    const controls = $$('input, select', form);
    const check = el => {
      const result = rules[el.name](el.value);
      const ok = result === true;
      el.closest('.field').classList.toggle('is-invalid', !ok);
      $('small', el.closest('.field')).textContent = ok ? '' : result;
      el.setAttribute('aria-invalid', String(!ok));
      return ok;
    };
    controls.forEach(el => {
      el.addEventListener('blur', () => { if (el.value) check(el); });
      el.addEventListener('change', () => check(el));
      el.addEventListener('input', () => { if (el.closest('.field').classList.contains('is-invalid')) check(el); });
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      errorMsg.hidden = true;
      const invalid = controls.filter(el => !check(el));
      if (invalid.length) { invalid[0].focus(); return; }

      submit.classList.add('is-loading');
      submitLabel.textContent = 'Sending…';
      try {
        if (FORM_ENDPOINT) {
          const res = await fetch(FORM_ENDPOINT, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
          if (!res.ok) throw new Error('Request failed: ' + res.status);
        } else {
          console.warn('Airbrick enquiry form: FORM_ENDPOINT is empty, so this enquiry was not sent anywhere.');
        }
        $('.enquiry__success-name').textContent = ', ' + form.elements.fullname.value.trim().split(/\s+/)[0];
        form.hidden = true;
        success.hidden = false;
      } catch (err) {
        errorMsg.hidden = false;
      } finally {
        submit.classList.remove('is-loading');
        submitLabel.textContent = 'Request a Consultation';
      }
    });
  }
})();
