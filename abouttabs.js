/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var Tab = function (tab) {
  this.favicon = tab.favIconUrl;
  this.title = tab.title;
  this.url = tab.url;
  this.lastAccessed = tab.lastAccessed;
  this.obj = tab;
  this.loaded = !tab.discarded;
};

Tab.prototype = {
  close: function (refreshOrEvent=true) {
    var that = this;
    var isEvent = refreshOrEvent && typeof refreshOrEvent === 'object' && refreshOrEvent.preventDefault;
    if (isEvent) {
      refreshOrEvent.preventDefault();
      refreshOrEvent.stopPropagation();
    }
    var scheme = getScheme(this.url);
    var schemes = {};
    if (scheme) {
      schemes[scheme] = 1;
    }
    browser.tabs.remove(this.obj.id).then(function() {
      delete that.obj;
      if (isEvent) {
        removeElementInPlace(refreshOrEvent, 1, schemes);
      } else if (refreshOrEvent !== false) {
        window.refresh();
      }
    }, onError);
  },

  switchTo: function () {
    browser.tabs.update(this.obj.id, {active: true}).catch(onError);
  },

  get lastAccessedAgo () {
    return window.refreshTime.timeAgo(this.lastAccessed);
  },

  get lastAccessedDate () {
    var date = new Date(this.lastAccessed);
    return date.toString();
  },
};

var _TabListMethods = {
  close_or_dedup: { value: function (keep_one, ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    var tabsToClose = [];
    for (var tab of (keep_one ? this.byLastAccessed() : this)) {
      if (keep_one) {
        keep_one = false;
        continue;
      }
      tabsToClose.push(tab);
    }
    var closedCount = tabsToClose.length;
    // Collect schemes before closing
    var schemes = {};
    for (var tab of tabsToClose) {
      var scheme = getScheme(tab.url);
      if (scheme) {
        schemes[scheme] = (schemes[scheme] || 0) + 1;
      }
      tab.close(false);
    }
    if (ev) {
      removeElementInPlace(ev, closedCount, schemes);
    } else {
      refresh();
    }
  }},

  close: { value: function (ev) {
    this.close_or_dedup(false, ev);
  }},

  byLastAccessed: { value: function* () {
    yield* this.slice().sort((a, b) => b.lastAccessed - a.lastAccessed);
  }},
};

var TabList = function () {
};

TabList.prototype = Object.create(Object.prototype, _TabListMethods);

Object.defineProperties(TabList.prototype, {
  slice: { value: function() {
    var items = [];
    for (key in this)
      items.push(this[key]);
    return items;
  }},
});

var TabArray = function () {
  this.push.apply(this, arguments);
};

TabArray.prototype = Object.create(Array.prototype, _TabListMethods);

Object.defineProperties(TabArray.prototype, {
  collectionByAddress: { get: function () {
    var result = new TabCollection('address');
    for (var tab of this) {
      tab = new Tab(tab.obj);
      result.add(tab.url, tab);
    }
    return result;
  }},
});

var DedupableTabArray = function () {
  TabArray.apply(this, arguments);
};

DedupableTabArray.prototype = Object.create(TabArray.prototype, {
  dedup: { value: function (ev) {
    this.close_or_dedup(true, ev);
  }},
});

var TabGroup = function () {
};

function _tabGroupMethod(name) {
  return function (ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    var schemes = {};
    var closedCount = 0;
    for (var group in this) {
      // Count tabs and schemes before closing
      for (var tab of this[group]) {
        var scheme = getScheme(tab.url);
        if (scheme) {
          schemes[scheme] = (schemes[scheme] || 0) + 1;
        }
        closedCount++;
      }
      this[group][name](null);
    }
    if (ev) {
      removeElementInPlace(ev, closedCount, schemes);
    } else {
      refresh();
    }
  }
}

TabGroup.prototype = Object.create(Object.prototype, {
  close: { value: _tabGroupMethod('close') },

  byLength: { value: function* () {
    var keys = Object.keys(this).sort((a, b) => this[b].length - this[a].length);
    for (var key of keys) {
      yield this[key];
    }
  }},
});

var DedupableTabGroup = function () {
};

DedupableTabGroup.prototype = Object.create(TabGroup.prototype, {
  dedup: { value: _tabGroupMethod('dedup') },
});

var TabCollection = function (what) {
  this.what = what;
  this.unique = new TabList();
  this.numUnique = 0;
  this.dupes = (what == 'address' ? new DedupableTabGroup() : new TabGroup());
  this.numDupes = 0;
};

TabCollection.prototype = {
  get length () {
    return this.numUnique + this.numDupes;
  },

  add: function(key, tab) {
    if (this.unique && key in this.unique) {
      var otherTab = this.unique[key];
      var tabArrayType = this.what == 'address' ? DedupableTabArray : TabArray;
      var dupes = this.dupes[key] = new tabArrayType(otherTab, tab);
      dupes.favicon = tab.favicon == otherTab.favicon ? tab.favicon : undefined;
      dupes.title = tab.title == otherTab.title ? tab.title : undefined;
      dupes.url = tab.url;
      this.numDupes++;
      delete this.unique[key];
      this.numUnique--;
    } else if (this.dupes && key in this.dupes) {
      var dupes = this.dupes[key];
      dupes.push(tab);
      if (dupes.favicon != tab.favicon) {
        delete dupes.favicon;
      }
      if (dupes.title != tab.title) {
        delete dupes.title;
      }
    } else {
      this.unique[key] = tab;
      this.numUnique++;
    }
  },
};

function* sortedByKey(obj) {
  for (var key of Object.keys(obj).sort()) {
    yield { key: key, value: obj[key] };
  }
}

function getScheme(url) {
  if (!url) return null;
  var match = url.match(/^([a-z][a-z0-9+.-]*:)/i);
  return match ? match[1] : null;
}

function removeElementInPlace(ev, closedCount, schemes) {
  var target = ev.target;

  // Find the parent <li> that should be animated out
  var li = target;
  while (li && li.tagName !== 'LI') {
    li = li.parentNode;
  }
  if (!li) {
    refresh();
    return;
  }

  // Check if this is an item-level close (inside a group) or group-level close
  var parentUl = li.parentNode;
  var isGroupLevel = li.classList.contains('group') && parentUl && parentUl.id === 'stats';
  var isSubGroupLevel = li.classList.contains('group') && parentUl && parentUl.classList.contains('host') || parentUl && parentUl.classList.contains('address');

  // Update the tab count in the header
  var h1 = document.querySelector('h1');
  if (h1 && closedCount > 0) {
    var currentCount = parseInt(h1.textContent) || 0;
    var newCount = currentCount - closedCount;
    h1.textContent = newCount + ' tab' + (newCount === 1 ? '' : 's');
  }

  // Update "loaded tabs" count
  var loadedLi = document.querySelector('#stats > li:first-child');
  if (loadedLi && closedCount > 0) {
    var match = loadedLi.textContent.match(/^(\d+)/);
    if (match) {
      var loadedCount = parseInt(match[1]) || 0;
      var newLoaded = Math.max(0, loadedCount - closedCount);
      loadedLi.textContent = newLoaded + ' tab' + (newLoaded === 1 ? '' : 's') + ' ' + (newLoaded === 1 ? 'has' : 'have') + ' been loaded';
    }
  }

  // Update scheme counts
  if (schemes) {
    var schemesLi = document.querySelector('li.schemes');
    if (schemesLi) {
      var spans = schemesLi.querySelectorAll('span');
      for (var span of spans) {
        var text = span.textContent;
        var schemeMatch = text.match(/^(\d+)\s+(.+)$/);
        if (schemeMatch) {
          var count = parseInt(schemeMatch[1]);
          var schemeKey = schemeMatch[2];
          if (schemes[schemeKey]) {
            var newCount = count - schemes[schemeKey];
            if (newCount > 0) {
              span.textContent = newCount + ' ' + schemeKey;
            } else {
              span.remove();
            }
          }
        }
      }
    }
  }

  // If this is a sub-item being closed (not a whole group), we may need to update parent counts
  if (!isGroupLevel && !isSubGroupLevel) {
    updateParentCounts(li);
  }

  // Animate the element out
  li.style.maxHeight = li.offsetHeight + 'px';
  // Force reflow
  li.offsetHeight;
  li.classList.add('removing');

  li.addEventListener('transitionend', function onEnd(e) {
    if (e.propertyName === 'opacity') {
      li.removeEventListener('transitionend', onEnd);
      li.remove();

      // Clean up empty parent groups
      cleanupEmptyGroups();
    }
  });
}

function updateParentCounts(removedLi) {
  // Walk up to find group headers and update their counts
  var parent = removedLi.parentNode;
  while (parent) {
    if (parent.tagName === 'LI' && parent.classList.contains('group')) {
      var span = parent.querySelector(':scope > span');
      if (span) {
        var text = span.textContent;
        // Match patterns like "5 addresses in more than 1 tab" or "3 unique addresses"
        var match = text.match(/^(\d+)\s+(.*)$/);
        if (match) {
          var count = parseInt(match[1]);
          var rest = match[2];
          var newCount = count - 1;
          if (newCount > 0) {
            // Update count, fix pluralization
            if (rest.includes(' in more than 1 tab')) {
              var what = rest.replace(' in more than 1 tab', '');
              // Fix pluralization for "address" -> "addresses", "host" -> "hosts"
              if (newCount === 1) {
                what = what.replace(/addresses$/, 'address').replace(/hosts$/, 'host');
              }
              span.textContent = newCount + ' ' + what + ' in more than 1 tab';
            } else if (rest.includes('unique')) {
              span.textContent = newCount + ' ' + rest;
            } else {
              span.textContent = newCount + ' ' + rest;
            }
          }
        }
      }
    }
    parent = parent.parentNode;
  }
}

function cleanupEmptyGroups() {
  // Remove any groups that now have empty <ul> children
  var groups = document.querySelectorAll('li.group');
  for (let group of groups) {
    var ul = group.querySelector(':scope > ul');
    if (ul && ul.children.length === 0) {
      group.style.maxHeight = group.offsetHeight + 'px';
      group.offsetHeight;
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

function refresh() {
  browser.windows.getAll({populate: true, windowTypes: ["normal"]}).then(refreshTabs, onError);
}

function onError(error) {
  console.log(`Error: ${error}`);
}

function refreshTabs(windows) {
  window.refreshTime = new MyDate(Date.now());

  var schemes = {};
  var data = {
    tabCount: 0,
    windowsCount: windows.length,
    blankTabs: 0,
    loadedTabs: 0,
    schemesByKey: function* () { yield* sortedByKey(schemes); },
    uris: new TabCollection('address'),
    hosts: new TabCollection('host'),
    groups: function* () {
      yield this.uris;
      yield this.hosts;
    }
  }

  var loc = document.createElement('a');

  for (let w of windows) {
    data.tabCount += w.tabs.length;
    for (let t of w.tabs) {
      loc.href = t.url;
      var tab = new Tab(t);
      if (tab.url == "about:blank") {
	data.blankTabs++
	continue;
      }
      if (tab.loaded) {
	data.loadedTabs++;
      }
      data.uris.add(tab.url, tab);
      try {
	if (loc.host) {
	  var hostTab = new Tab(t);
	  hostTab.title = loc.host;
	  delete hostTab.url;
	  data.hosts.add(loc.host, hostTab);
	}
      } catch(e) {}
      if (loc.protocol in schemes)
	schemes[loc.protocol]++;
      else
	schemes[loc.protocol] = 1;
    }
  }

  var body = document.body;

  while (body.firstChild)
    body.removeChild(body.firstChild);

  templates.main.instantiate(body, data);
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
  var wasOpen = !node.classList.contains('closed');
  var ul = node.querySelector(':scope > ul');

  function clearAnimationStyles(e) {
    if (e.propertyName === 'max-height') {
      ul.removeEventListener('transitionend', clearAnimationStyles);
      ul.style.maxHeight = '';
      ul.style.opacity = '';
      ul.style.visibility = '';
    }
  }

  if (!wasOpen && ul) {
    // Opening: instantiate delayed content if needed
    if (ul.instantiate) {
      ul.instantiate();
    }
    // Remove closed class first so we can measure
    node.classList.remove('closed');
    // Set styles for animation
    ul.style.visibility = 'visible';
    ul.style.maxHeight = ul.scrollHeight + 'px';
    ul.style.opacity = '1';
    ul.addEventListener('transitionend', clearAnimationStyles);
  } else if (wasOpen && ul) {
    // Closing: set up collapse animation
    ul.style.visibility = 'visible';
    ul.style.maxHeight = ul.scrollHeight + 'px';
    ul.style.opacity = '1';
    ul.offsetHeight; // Force reflow
    ul.addEventListener('transitionend', clearAnimationStyles);
    node.classList.add('closed');
  } else {
    node.classList.toggle('closed');
  }
}

window.addEventListener("load", refresh, false);
