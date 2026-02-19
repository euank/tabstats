/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const templates = {};

class Template {
  constructor(templateNode) {
    this._template = templateNode.content;
  }

  instantiate(parentNode, values) {
    if (typeof values === 'function') {
      for (const item of values()) {
        parentNode.appendChild(this._instantiate(item, this._template));
      }
    } else {
      parentNode.appendChild(this._instantiate(values, this._template));
    }
  }

  _instantiate(values, node) {
    let newNode;

    if (node.nodeType === Node.ELEMENT_NODE) {
      const condition = node.getAttribute('template-if');
      if (condition && !format(condition, values)) {
        return undefined;
      }

      newNode = node.localName === 'apply'
        ? document.createDocumentFragment()
        : document.createElementNS(node.namespaceURI, node.localName);

      for (const attr of node.attributes) {
        if (attr.name.startsWith('event-')) {
          newNode.addEventListener(attr.name.slice(6), format(attr.value, values), false);
        } else if (!attr.name.startsWith('template')) {
          let value = format(attr.value, values);
          if (value && typeof value !== 'string') {
            value = JSON.stringify(value);
          }
          newNode.setAttribute(attr.name, value ?? '');
        }
      }
    } else if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      newNode = document.createDocumentFragment();
    }

    for (const child of node.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const subNode = this._instantiate(values, child);
        if (subNode) {
          newNode.appendChild(subNode);
        }
      } else if (child.nodeType === Node.TEXT_NODE) {
        let text = format(child.nodeValue, values);
        if (text && typeof text !== 'string') {
          text = JSON.stringify(text);
        }
        if (text?.match(/\S/)) {
          newNode.appendChild(document.createTextNode(text));
        }
      }
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      let templateName = node.getAttribute('template-delay');
      const delay = !!templateName;
      if (!templateName) {
        templateName = node.getAttribute('template');
      }

      const template = templateName ? templates[templateName] : null;
      if (template) {
        const dataAttr = node.getAttribute('template-data');
        if (delay) {
          newNode.instantiate = function() {
            const d = dataAttr ? format(dataAttr, values) : values;
            template.instantiate(this, d);
            delete this.instantiate;
          };
        } else {
          const data = dataAttr ? format(dataAttr, values) : values;
          template.instantiate(newNode, data);
        }
      }
    }

    return newNode;
  }
}

function plural(n, noun) {
  if (n === 1) return noun;
  if (noun.endsWith('s')) return noun + 'es';
  if (noun.endsWith('sh')) return noun;
  if (noun.endsWith('ch')) return noun + 'es';
  if (noun.endsWith('x')) return noun + 'es';
  return noun + 's';
}

function _getValue(values, expr) {
  const andParts = expr.split(/\s*&&\s*/);
  if (andParts.length > 1) {
    return andParts.every(part => _getValue(values, part));
  }

  if (expr.charAt(0) === '!') {
    return !_getValue(values, expr.slice(1));
  }

  const name = expr.split('.', 1)[0];
  if (name === expr) {
    let ret = expr in values ? values[expr] : window[expr];
    if (typeof ret === 'function') {
      ret = ret.bind(values);
    }
    return ret;
  }
  return _getValue(values[name], expr.slice(name.length + 1));
}

// format('${n}_dog ${k}_horse', {n: 2, k: 1}) => "2 dogs 1 horse"
// format('${n}_happy_dog', {n: 4}) => "4 happy dogs"
// format('${n}_dog ${n}?(has|have) fleas', {n: 1}) => "1 dog has fleas"
// format('${n}_dog ${n}?(has|have) fleas', {n: 2}) => "2 dogs have fleas"
// format('${n}_unique_${thing}', {n: 2, thing: 'thing'}) => "2 unique things"
// format('${foo} is ${bar}', {foo: 'a', bar: 'b'}) => "a is b"
// format('${n} ${bar}', {n: 2, bar: 'http'}) => "2 http"
function format(str, values) {
  if (!str.includes('${')) {
    return str;
  }

  const parts = str.split(/\$\{(\!*[\w\.]+(?:\s*&&\s*\!*[\w\.]+)*)\}/g);
  if (parts.length === 1) {
    return str;
  }
  if (parts.length === 3 && !parts[0] && !parts[2]) {
    return _getValue(values, parts[1]);
  }

  let result = parts[0];
  for (let i = 1; i < parts.length; i += 2) {
    const n = parts[i] ? _getValue(values, parts[i]) : '';
    const fragment = parts[i + 1];

    if (typeof n === 'string') {
      result += n + fragment;
      continue;
    }

    if (fragment.charAt(0) === '_') {
      if (fragment.slice(-1) === '_') {
        result += n + fragment.replace(/_/g, ' ') + plural(n, _getValue(values, parts[i + 2]));
        parts[i + 2] = '';
      } else {
        result += n + fragment.replace(/^([\w_]*)([^_\W])+/, (_, before, word) =>
          before.replace(/_/g, ' ') + plural(n, word));
      }
    } else if (fragment.charAt(0) === '?') {
      result += fragment.replace(/\?\((.*?)\|(.*)\)/, (_, a, b) => n === 1 ? a : b);
    } else {
      result += n + fragment;
    }
  }
  return result;
}

function init() {
  for (const template of document.getElementsByTagName('template')) {
    templates[template.id] = new Template(template);
  }
}

window.addEventListener('load', init, false);
