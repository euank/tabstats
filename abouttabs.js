/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

class Tab {
  constructor(tab) {
    this.favicon = tab.favIconUrl;
    this.title = tab.title;
    this.url = tab.url;
    this.lastAccessed = tab.lastAccessed;
    this.obj = tab;
    this.loaded = !tab.discarded;
  }

  async close(refreshOrEvent = true) {
    const isEvent = refreshOrEvent?.preventDefault;
    if (isEvent) {
      refreshOrEvent.preventDefault();
      refreshOrEvent.stopPropagation();
    }

    const url = this.url || this.obj?.url;
    const scheme = getScheme(url);
    const schemes = scheme ? { [scheme]: 1 } : {};
    const loadedCount = this.loaded ? 1 : 0;

    try {
      await browser.tabs.remove(this.obj.id);
      delete this.obj;
      if (isEvent) {
        removeElementInPlace(refreshOrEvent, 1, loadedCount, schemes);
      } else if (refreshOrEvent !== false) {
        window.refresh();
      }
    } catch (e) {
      onError(e);
    }
  }

  async switchTo() {
    try {
      await browser.tabs.update(this.obj.id, { active: true });
    } catch (e) {
      onError(e);
    }
  }

  get lastAccessedAgo() {
    return window.refreshTime.timeAgo(this.lastAccessed);
  }

  get lastAccessedDate() {
    return new Date(this.lastAccessed).toString();
  }
}

// Mixin for shared tab collection methods
const TabCollectionMixin = {
  closeOrDedup(keepOne, ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }

    const tabsToClose = [];
    let skip = keepOne;
    for (const tab of (keepOne ? this.byLastAccessed() : this)) {
      if (skip) {
        skip = false;
        continue;
      }
      tabsToClose.push(tab);
    }

    const schemes = {};
    let loadedCount = 0;
    for (const tab of tabsToClose) {
      const url = tab.url || tab.obj?.url;
      const scheme = getScheme(url);
      if (scheme) {
        schemes[scheme] = (schemes[scheme] || 0) + 1;
      }
      if (tab.loaded) {
        loadedCount++;
      }
      tab.close(false);
    }

    if (ev) {
      removeElementInPlace(ev, tabsToClose.length, loadedCount, schemes);
    } else if (ev !== null) {
      refresh();
    }
  },

  close(ev) {
    this.closeOrDedup(false, ev);
  },

  *byLastAccessed() {
    yield* this.slice().sort((a, b) => b.lastAccessed - a.lastAccessed);
  }
};

class TabList {
  slice() {
    return Object.keys(this)
      .filter(k => this[k] instanceof Tab)
      .map(k => this[k]);
  }

  *[Symbol.iterator]() {
    yield* this.slice();
  }
}

Object.assign(TabList.prototype, TabCollectionMixin);

class TabArray extends Array {
  constructor(...args) {
    super();
    this.push(...args);
  }

  get collectionByAddress() {
    const result = new TabCollection('address');
    for (const tab of this) {
      const newTab = new Tab(tab.obj);
      result.add(newTab.url, newTab);
    }
    return result;
  }
}

Object.assign(TabArray.prototype, TabCollectionMixin);

class DedupableTabArray extends TabArray {
  dedup(ev) {
    this.closeOrDedup(true, ev);
  }
}

class TabGroup {
  constructor() {}

  _groupMethod(methodName, ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }

    const schemes = {};
    let closedCount = 0;
    let loadedCount = 0;
    const isDedup = methodName === 'dedup';

    for (const key of Object.keys(this)) {
      const group = this[key];
      if (!group?.[methodName]) continue;

      let skipped = false;
      for (const tab of (isDedup ? group.byLastAccessed() : group)) {
        if (isDedup && !skipped) {
          skipped = true;
          continue;
        }
        const url = tab.url || tab.obj?.url;
        const scheme = getScheme(url);
        if (scheme) {
          schemes[scheme] = (schemes[scheme] || 0) + 1;
        }
        if (tab.loaded) {
          loadedCount++;
        }
        closedCount++;
      }
      group[methodName](null);
    }

    if (ev) {
      removeElementInPlace(ev, closedCount, loadedCount, schemes);
    } else {
      refresh();
    }
  }

  close(ev) {
    this._groupMethod('close', ev);
  }

  *byLength() {
    const keys = Object.keys(this)
      .filter(k => this[k]?.length !== undefined)
      .sort((a, b) => this[b].length - this[a].length);
    for (const key of keys) {
      yield this[key];
    }
  }
}

class DedupableTabGroup extends TabGroup {
  dedup(ev) {
    this._groupMethod('dedup', ev);
  }
}

class TabCollection {
  constructor(what) {
    this.what = what;
    this.unique = new TabList();
    this.numUnique = 0;
    this.dupes = what === 'address' ? new DedupableTabGroup() : new TabGroup();
    this.numDupes = 0;
  }

  get length() {
    return this.numUnique + this.numDupes;
  }

  add(key, tab) {
    if (key in this.unique) {
      const otherTab = this.unique[key];
      const ArrayType = this.what === 'address' ? DedupableTabArray : TabArray;
      const dupes = this.dupes[key] = new ArrayType(otherTab, tab);
      dupes.favicon = tab.favicon === otherTab.favicon ? tab.favicon : undefined;
      dupes.title = tab.title === otherTab.title ? tab.title : undefined;
      dupes.url = tab.url;
      this.numDupes++;
      delete this.unique[key];
      this.numUnique--;
    } else if (key in this.dupes) {
      const dupes = this.dupes[key];
      dupes.push(tab);
      if (dupes.favicon !== tab.favicon) delete dupes.favicon;
      if (dupes.title !== tab.title) delete dupes.title;
    } else {
      this.unique[key] = tab;
      this.numUnique++;
    }
  }
}

function* sortedByKey(obj) {
  for (const key of Object.keys(obj).sort()) {
    yield { key, value: obj[key] };
  }
}

function getScheme(url) {
  if (!url) return null;
  const match = url.match(/^([a-z][a-z0-9+.-]*:)/i);
  return match?.[1] ?? null;
}

function removeElementInPlace(ev, closedCount, loadedCount, schemes) {
  let li = ev.target;
  while (li && li.tagName !== 'LI') {
    li = li.parentNode;
  }
  if (!li) {
    refresh();
    return;
  }

  const parentUl = li.parentNode;
  const isGroupLevel = li.classList.contains('group') && parentUl?.id === 'stats';
  const isSubGroupLevel = (li.classList.contains('group') && parentUl?.classList.contains('host')) ||
                          parentUl?.classList.contains('address');

  // Update tab count in header
  const h1 = document.querySelector('h1');
  if (h1 && closedCount > 0) {
    const currentCount = parseInt(h1.textContent) || 0;
    const newCount = currentCount - closedCount;
    h1.textContent = `${newCount} tab${newCount === 1 ? '' : 's'}`;
  }

  // Update "loaded tabs" count
  const loadedLi = document.querySelector('#stats > li:first-child');
  if (loadedLi && loadedCount > 0) {
    const match = loadedLi.textContent.match(/^(\d+)/);
    if (match) {
      const newLoaded = Math.max(0, (parseInt(match[1]) || 0) - loadedCount);
      loadedLi.textContent = `${newLoaded} tab${newLoaded === 1 ? '' : 's'} ${newLoaded === 1 ? 'has' : 'have'} been loaded`;
    }
  }

  // Update scheme counts
  if (schemes) {
    const schemesLi = document.querySelector('li.schemes');
    if (schemesLi) {
      for (const span of schemesLi.querySelectorAll('span')) {
        const schemeMatch = span.textContent.match(/^(\d+)\s+(.+)$/);
        if (schemeMatch) {
          const [, countStr, schemeKey] = schemeMatch;
          if (schemes[schemeKey]) {
            const newCount = parseInt(countStr) - schemes[schemeKey];
            if (newCount > 0) {
              span.textContent = `${newCount} ${schemeKey}`;
            } else {
              span.remove();
            }
          }
        }
      }
    }
  }

  if (!isGroupLevel && !isSubGroupLevel) {
    updateParentCounts(li);
  }

  // Animate out
  li.style.maxHeight = `${li.offsetHeight}px`;
  li.offsetHeight; // Force reflow
  li.classList.add('removing');

  li.addEventListener('transitionend', function onEnd(e) {
    if (e.propertyName === 'opacity') {
      li.removeEventListener('transitionend', onEnd);
      li.remove();
      cleanupEmptyGroups();
    }
  });
}

function updateParentCounts(removedLi) {
  let parent = removedLi.parentNode;
  while (parent) {
    if (parent.tagName === 'LI' && parent.classList.contains('group')) {
      const span = parent.querySelector(':scope > span');
      if (span) {
        const match = span.textContent.match(/^(\d+)\s+(.*)$/);
        if (match) {
          const [, countStr, rest] = match;
          const newCount = parseInt(countStr) - 1;
          if (newCount > 0) {
            if (rest.includes(' in more than 1 tab')) {
              let what = rest.replace(' in more than 1 tab', '');
              if (newCount === 1) {
                what = what.replace(/addresses$/, 'address').replace(/hosts$/, 'host');
              }
              span.textContent = `${newCount} ${what} in more than 1 tab`;
            } else {
              span.textContent = `${newCount} ${rest}`;
            }
          }
        }
      }
    }
    parent = parent.parentNode;
  }
}

function cleanupEmptyGroups() {
  for (const group of document.querySelectorAll('li.group')) {
    const ul = group.querySelector(':scope > ul');
    if (ul?.children.length === 0 && !ul.instantiate) {
      group.style.maxHeight = `${group.offsetHeight}px`;
      group.offsetHeight; // Force reflow
      group.classList.add('removing');
      group.addEventListener('transitionend', function onEnd(e) {
        if (e.propertyName === 'opacity') {
          e.currentTarget.removeEventListener('transitionend', onEnd);
          e.currentTarget.remove();
        }
      });
    }
  }
}

async function refresh() {
  try {
    const windows = await browser.windows.getAll({ populate: true, windowTypes: ['normal'] });
    refreshTabs(windows);
  } catch (e) {
    onError(e);
  }
}

function onError(error) {
  console.log(`Error: ${error}`);
}

function refreshTabs(windows) {
  window.refreshTime = new MyDate(Date.now());

  const schemes = {};
  const data = {
    tabCount: 0,
    windowsCount: windows.length,
    blankTabs: 0,
    loadedTabs: 0,
    schemesByKey: function* () { yield* sortedByKey(schemes); },
    uris: new TabCollection('address'),
    hosts: new TabCollection('host'),
    *groups() {
      yield this.uris;
      yield this.hosts;
    }
  };

  const loc = document.createElement('a');

  for (const w of windows) {
    data.tabCount += w.tabs.length;
    for (const t of w.tabs) {
      loc.href = t.url;
      const tab = new Tab(t);

      if (tab.url === 'about:blank') {
        data.blankTabs++;
        continue;
      }

      if (tab.loaded) {
        data.loadedTabs++;
      }

      data.uris.add(tab.url, tab);

      try {
        if (loc.host) {
          const hostTab = new Tab(t);
          hostTab.title = loc.host;
          delete hostTab.url;
          data.hosts.add(loc.host, hostTab);
        }
      } catch (e) {}

      schemes[loc.protocol] = (schemes[loc.protocol] || 0) + 1;
    }
  }

  document.body.replaceChildren();
  templates.main.instantiate(document.body, data);
}

function squashEvent(ev) {
  ev.stopPropagation();
}

function toggleSelf(ev) {
  ev.stopPropagation();
  toggle(ev.currentTarget);
}

function toggleParentParentParent(ev) {
  toggle(ev.currentTarget.parentNode.parentNode.parentNode);
}

function toggle(node) {
  const wasOpen = !node.classList.contains('closed');
  const ul = node.querySelector(':scope > ul');

  const clearAnimationStyles = (e) => {
    if (e.propertyName === 'max-height') {
      ul.removeEventListener('transitionend', clearAnimationStyles);
      ul.style.maxHeight = '';
      ul.style.opacity = '';
      ul.style.visibility = '';
    }
  };

  if (!wasOpen && ul) {
    ul.instantiate?.();
    // Set explicit starting values so transition can animate (can't animate from 'none')
    ul.style.maxHeight = '0';
    ul.style.opacity = '0';
    ul.style.visibility = 'visible';
    ul.offsetHeight; // Force reflow
    node.classList.remove('closed');
    ul.style.maxHeight = `${ul.scrollHeight}px`;
    ul.style.opacity = '1';
    ul.addEventListener('transitionend', clearAnimationStyles);
  } else if (wasOpen && ul) {
    ul.style.visibility = 'visible';
    ul.style.maxHeight = `${ul.scrollHeight}px`;
    ul.style.opacity = '1';
    ul.offsetHeight; // Force reflow
    ul.addEventListener('transitionend', clearAnimationStyles);
    node.classList.add('closed');
  } else {
    node.classList.toggle('closed');
  }
}

window.addEventListener('load', refresh, false);
