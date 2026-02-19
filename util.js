/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

class MyDate {
  constructor(timestamp, lightweight = false) {
    this.timestamp = timestamp;
    this.date = new Date(timestamp);

    const year = this.date.getFullYear();
    const month = this.date.getMonth();
    this.month = year * 12 + month;

    if (!lightweight) {
      const first = new Date(year, month, 1);
      this.offsetFromFirst = timestamp - first.getTime();
    }
  }

  timeAgo(timestamp) {
    const delta = Math.trunc(this.timestamp - timestamp) / 1000;

    if (delta < 2419200) { // 28 days / 4 weeks
      if (delta < 60) return 'less than a minute ago';
      if (delta < 120) return 'about a minute ago';
      if (delta < 3600) return `${Math.trunc(delta / 60)} minutes ago`;
      if (delta < 7200) return 'more than an hour ago';
      if (delta < 86400) return `more than ${Math.trunc(delta / 3600)} hours ago`;
      if (delta < 172800) return 'more than a day ago';
      if (delta < 604800) return `more than ${Math.trunc(delta / 86400)} days ago`;
      if (delta < 1209600) return 'more than a week ago';
      return `more than ${Math.trunc(delta / 604800)} weeks ago`;
    }

    const other = new MyDate(timestamp - this.offsetFromFirst - 1, true);
    const monthDelta = this.month - other.month - 1;

    if (monthDelta < 1) return 'more than 4 weeks ago';
    if (monthDelta === 1) return 'more than a month ago';
    if (monthDelta < 12) return `more than ${monthDelta} months ago`;
    if (monthDelta < 24) return 'more than a year ago';
    return `more than ${Math.trunc(monthDelta / 12)} years ago`;
  }
}
