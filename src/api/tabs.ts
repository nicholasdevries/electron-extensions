import { ipcRenderer } from 'electron';

import { IpcEvent } from '../models/ipc-event';
import { makeId } from '../utils/string';
import { IpcExtension } from '../models/ipc-extension';
import { getSender } from '../utils/sender';

export const getTabs = (extension: IpcExtension, sessionId: number) => {
  const tabs = {
    onCreated: new IpcEvent('tabs', 'onCreated', sessionId),
    onUpdated: new IpcEvent('tabs', 'onUpdated', sessionId),
    onActivated: new IpcEvent('tabs', 'onActivated', sessionId),
    onRemoved: new IpcEvent('tabs', 'onRemoved', sessionId),

    get: (tabId: number, callback: (tab: chrome.tabs.Tab) => void) => {
      tabs.query({}, tabs => {
        callback(tabs.find(x => x.id === tabId));
      });
    },

    getCurrent: (callback: (tab: chrome.tabs.Tab) => void) => {
      tabs.get(ipcRenderer.sendSync('get-webcontents-id'), tab => {
        callback(tab);
      });
    },

    query: async (
      queryInfo: chrome.tabs.QueryInfo,
      callback: (tabs: chrome.tabs.Tab[]) => void,
    ) => {
      const readProperty = (obj: any, prop: string) => obj[prop];
      const data: chrome.tabs.Tab[] = await ipcRenderer.invoke(
        `api-tabs-query-${sessionId}`,
      );

      callback(
        data.filter(tab => {
          for (const key in queryInfo) {
            const tabProp = readProperty(tab, key);
            const queryInfoProp = readProperty(queryInfo, key);

            if (key === 'url' && queryInfoProp === '<all_urls>') {
              return true;
            }

            if (tabProp == null || queryInfoProp !== tabProp) {
              return false;
            }
          }

          return true;
        }),
      );
    },

    create: (
      createProperties: chrome.tabs.CreateProperties,
      callback: (tab: chrome.tabs.Tab) => void = null,
    ) => {
      const responseId = makeId(32);
      ipcRenderer.send(
        `api-tabs-create-${sessionId}`,
        responseId,
        createProperties,
      );

      if (callback) {
        ipcRenderer.once(
          `api-tabs-create-${responseId}`,
          (e, data: chrome.tabs.Tab) => {
            callback(data);
          },
        );
      }
    },

    insertCSS: (...args: any[]) => {
      const insertCSS = async (tabId: number, details: any, callback: any) => {
        await ipcRenderer.invoke(
          `api-tabs-insertCSS-${sessionId}`,
          tabId,
          details,
          extension.path,
        );
        if (callback) callback();
      };

      if (typeof args[0] === 'object') {
        tabs.getCurrent(tab => {
          insertCSS(tab.id, args[0], args[1]);
        });
      } else if (typeof args[0] === 'number') {
        insertCSS(args[0], args[1], args[2]);
      }
    },

    executeScript: (...args: any[]) => {
      const executeScript = async (
        tabId: number,
        details: any,
        callback: any,
      ) => {
        const result = await ipcRenderer.invoke(
          `api-tabs-executeScript-${sessionId}`,
          {
            tabId,
            details,
            basePath: extension.path,
          },
        );

        if (callback) {
          callback(result);
        }
      };

      if (typeof args[0] === 'object') {
        tabs.getCurrent(tab => {
          if (tab) {
            executeScript(tab.id, args[0], args[1]);
          }
        });
      } else if (typeof args[0] === 'number') {
        executeScript(args[0], args[1], args[2]);
      }
    },

    setZoom: (tabId: number, zoomFactor: number, callback: () => void) => {
      ipcRenderer.send(`api-tabs-setZoom-${sessionId}`, tabId, zoomFactor);

      ipcRenderer.once('api-tabs-setZoom', () => {
        if (callback) {
          callback();
        }
      });
    },

    getZoom: (tabId: number, callback: (zoomFactor: number) => void) => {
      ipcRenderer.send(`api-tabs-getZoom-${sessionId}`, tabId);

      ipcRenderer.once('api-tabs-getZoom', (e, zoomFactor: number) => {
        if (callback) {
          callback(zoomFactor);
        }
      });
    },

    detectLanguage: (tabId: number, callback: (language: string) => void) => {
      ipcRenderer.send(`api-tabs-detectLanguage-${sessionId}`, tabId);

      ipcRenderer.once('api-tabs-detectLanguage', (e, language: string) => {
        if (callback) {
          callback(language);
        }
      });
    },

    sendMessage: (...args: any[]) => {
      const sender = getSender(extension.id);
      const portId = makeId(32);

      const tabId = args[0];
      const message = args[1];
      const options = args[2];
      let responseCallback = args[3];

      if (typeof args[2] === 'function') {
        responseCallback = args[2];
      }

      if (typeof args[3] === 'function') {
        responseCallback = args[3];
      }

      if (options && options.includeTlsChannelId) {
        sender.tlsChannelId = portId;
      }

      if (typeof responseCallback === 'function') {
        ipcRenderer.on(
          `api-tabs-sendMessage-response-${portId}`,
          (e, res: any) => {
            responseCallback(res);
          },
        );
      }

      ipcRenderer.send(`api-tabs-sendMessage-${sessionId}`, {
        tabId,
        portId,
        sender,
        message,
      });
    },

    update: () => {},
  };

  return tabs;
};
