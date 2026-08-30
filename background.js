function openAboutTabs() {
  browser.tabs.create({url: browser.runtime.getURL("abouttabs.html")});
}
browser.browserAction.onClicked.addListener(openAboutTabs);
