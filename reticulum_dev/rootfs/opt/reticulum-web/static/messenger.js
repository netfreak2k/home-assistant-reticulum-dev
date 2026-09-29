/*
 * Netfreak2k Reticulum Messenger
 * 0.97.0 · External App Core
 */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const state = {
    contacts: [],
    activeTab: "chats"
  };

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cleanName(contact) {
    const peer =
      String(contact?.destination_hash || "");

    const raw =
      String(contact?.display_name || "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim();

    if (
      raw &&
      raw !== "Anonymous Peer" &&
      !raw.includes("\uFFFD")
    ) {
      return raw;
    }

    return peer
      ? "Kontakt " + peer.slice(0, 6).toUpperCase()
      : "Unbekannt";
  }

  function renderContacts() {
    const root = $("msg-contact-list");
    if (!root) return;

    if (!state.contacts.length) {
      root.innerHTML =
        '<div class="m97-empty">Keine Kontakte gefunden.</div>';
      return;
    }

    root.innerHTML =
      state.contacts.map(contact => {
        const peer =
          String(contact.destination_hash || "");

        const name =
          cleanName(contact);

        return `
          <button
            type="button"
            class="messenger-contact m97-contact"
            data-m97-peer="${esc(peer)}"
          >
            <span class="messenger-contact-avatar">
              ${esc(name[0] || "?")}
            </span>

            <span class="messenger-contact-body">
              <span class="messenger-contact-name">
                ${esc(name)}
              </span>

              <span class="messenger-contact-preview">
                Reticulum · LXMF
              </span>
            </span>
          </button>
        `;
      }).join("");

    root.querySelectorAll("[data-m97-peer]")
      .forEach(button => {
        button.onclick = () => {
          const peer =
            button.dataset.m97Peer;

          if (
            typeof window.openMessengerConversation
            === "function"
          ) {
            window.openMessengerConversation(peer);
          } else if (
            typeof window.openLXMFChat === "function"
          ) {
            window.openLXMFChat(peer);
          }
        };
      });
  }

  async function loadContacts() {
    try {
      const response =
        await fetch(
          "api/messenger/contacts?ts=" + Date.now(),
          {cache: "no-store"}
        );

      const data =
        await response.json();

      state.contacts =
        Array.isArray(data?.contacts)
          ? data.contacts
          : [];

      state.contacts.sort(
        (a, b) =>
          Number(b?.last_seen || 0) -
          Number(a?.last_seen || 0)
      );

      renderContacts();

    } catch (error) {
      console.error(
        "[Messenger 0.97] contacts",
        error
      );
    }
  }

  function selectTab(tab) {
    state.activeTab = tab;

    const app =
      document.getElementById("messenger-app");

    const conversation =
      document.querySelector(".messenger-conversation");

    if (app) {
      app.style.setProperty(
        "display",
        "block",
        "important"
      );
    }

    if (conversation) {
      conversation.style.setProperty(
        "display",
        "none",
        "important"
      );
    }

    document
      .querySelectorAll("[data-msg-tab]")
      .forEach(button => {
        button.classList.toggle(
          "active",
          button.dataset.msgTab === tab
        );
      });

    const contacts =
      $("msg-contacts-view");

    const settings =
      $("msg-settings-view");

    const chats =
      $("messenger-chat-list");

    if (contacts) {
      contacts.hidden = tab !== "contacts";
      contacts.style.setProperty(
        "display",
        tab === "contacts" ? "block" : "none",
        "important"
      );
    }

    if (settings) {
      settings.hidden = tab !== "settings";
      settings.style.setProperty(
        "display",
        tab === "settings" ? "block" : "none",
        "important"
      );
    }

    if (chats) {
      chats.hidden = tab !== "chats";
      chats.style.setProperty(
        "display",
        tab === "chats" ? "block" : "none",
        "important"
      );
    }

    if (tab === "contacts") {
      loadContacts();
    }
  }

  function init() {
    console.info(
      "[Reticulum Messenger] 0.97 external core"
    );

    document
      .querySelectorAll("[data-msg-tab]")
      .forEach(button => {
        button.onclick = () =>
          selectTab(button.dataset.msgTab);
      });

    selectTab("chats");
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once: true}
    );
  } else {
    init();
  }

  window.reticulumMessenger097 = {
    state,
    loadContacts,
    selectTab
  };
})();

/* =====================================================
   0.97 · EXTERNAL CHAT LIST
   ===================================================== */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  let lastSignature = "";

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function chatName(chat) {
    const name =
      String(chat?.display_name || "").trim();

    if (
      name &&
      !/^Kontakt\s+[0-9A-F]+$/i.test(name)
    ) {
      return name;
    }

    const peer =
      String(chat?.peer_hash || "");

    return peer
      ? "Kontakt " + peer.slice(0,6).toUpperCase()
      : "Unbekannt";
  }

  function chatTime(ts) {
    ts = Number(ts || 0);
    if (!ts) return "";

    const d = new Date(ts * 1000);
    const now = new Date();

    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(
        "de-DE",
        {hour:"2-digit", minute:"2-digit"}
      );
    }

    return d.toLocaleDateString(
      "de-DE",
      {day:"2-digit", month:"2-digit"}
    );
  }

  function renderChats(chats) {
    const root = $("messenger-chat-list");
    if (!root) return;

    if (!chats.length) {
      root.innerHTML = `
        <div class="m97-empty">
          Noch keine Gespräche.
        </div>
      `;
      return;
    }

    root.innerHTML = chats.map(chat => {
      const peer =
        String(chat.peer_hash || "");

      const name =
        chatName(chat);

      const preview =
        String(chat.last_message || "Noch keine Nachrichten");

      const unread =
        Number(chat.unread || 0);

      return `
        <button
          type="button"
          class="messenger-contact"
          data-m97-chat="${esc(peer)}"
        >
          <span class="messenger-contact-avatar">
            ${esc(name[0] || "?")}
          </span>

          <span class="messenger-contact-body">
            <span class="messenger-contact-name">
              ${esc(name)}
            </span>

            <span class="messenger-contact-preview">
              ${esc(preview)}
            </span>
          </span>

          <span class="messenger-contact-time">
            ${esc(chatTime(chat.last_timestamp))}
            ${
              unread > 0
                ? `<span class="m80-unread">${unread}</span>`
                : ""
            }
          </span>
        </button>
      `;
    }).join("");

    root
      .querySelectorAll("[data-m97-chat]")
      .forEach(button => {
        button.onclick = () => {
          const peer =
            button.dataset.m97Chat;

          if (
            typeof window.openMessengerConversation
            === "function"
          ) {
            window.openMessengerConversation(peer);
          }
        };
      });
  }

  async function refreshChats() {
    try {
      const response =
        await fetch(
          "api/messenger?ts=" + Date.now(),
          {cache:"no-store"}
        );

      if (!response.ok) return;

      const data =
        await response.json();

      const chats =
        Array.isArray(data?.conversations)
          ? data.conversations
          : [];

      const signature =
        JSON.stringify(
          chats.map(c => [
            c.peer_hash,
            c.last_timestamp,
            c.last_message,
            c.unread
          ])
        );

      if (signature === lastSignature) {
        return;
      }

      lastSignature = signature;
      renderChats(chats);

    } catch (error) {
      console.error(
        "[Messenger 0.97] chats",
        error
      );
    }
  }

  refreshChats();

  setInterval(
    refreshChats,
    10000
  );

  window.reticulumMessengerChats097 = {
    refresh: refreshChats
  };
})();

/* =====================================================
   0.97 · EXTERNAL OPEN CHAT
   ===================================================== */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  let activePeer = "";

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function shortTime(ts) {
    ts = Number(ts || 0);
    if (!ts) return "";

    return new Date(ts * 1000)
      .toLocaleTimeString(
        "de-DE",
        {hour:"2-digit", minute:"2-digit"}
      );
  }

  async function renderConversation(scrollBottom=true) {
    const box = $("lxmf-inbox");
    if (!box || !activePeer) return;

    try {
      const response =
        await fetch(
          "api/messenger?ts=" + Date.now(),
          {cache:"no-store"}
        );

      if (!response.ok) return;

      const data = await response.json();

      const chats =
        Array.isArray(data?.conversations)
          ? data.conversations
          : [];

      const chat =
        chats.find(
          c => String(c.peer_hash || "") === activePeer
        );

      const messages =
        Array.isArray(chat?.messages)
          ? chat.messages
          : [];

      if (!messages.length) {
        box.innerHTML =
          '<div class="m97-empty">' +
          'Noch keine Nachrichten mit diesem Kontakt.' +
          '</div>';
        return;
      }

      box.innerHTML =
        messages.map(message => {
          const mine =
            message.direction === "out";

          return `
            <div class="lxmf-message-row ${
              mine ? "mine" : "theirs"
            }">
              <div class="lxmf-bubble">
                <div class="lxmf-bubble-content">
                  ${esc(message.content || "")}
                </div>
                <div class="lxmf-bubble-meta">
                  ${esc(shortTime(message.timestamp))}
                  ${mine ? " · ausgehend" : ""}
                </div>
              </div>
            </div>
          `;
        }).join("");

      if (scrollBottom) {
        box.scrollTop = box.scrollHeight;
      }

    } catch (error) {
      console.error(
        "[Messenger 0.97] conversation",
        error
      );
    }
  }

  window.openMessengerConversation =
    function(peer) {
      activePeer =
        String(peer || "").trim();

      if (!activePeer) return;

      const hidden =
        $("lxmf-chat-destination");

      if (hidden) {
        hidden.value = activePeer;
      }

      if (
        typeof window.messengerShowConversation
        === "function"
      ) {
        window.messengerShowConversation();
      }

      renderConversation(true);
    };

  window.reticulumConversation097 = {
    render: renderConversation,
    get activePeer() {
      return activePeer;
    }
  };
})();

/* =====================================================
   0.97 · EXTERNAL SEND
   ===================================================== */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  async function sendMessage() {
    const input =
      $("lxmf-chat-content");

    const destination =
      $("lxmf-chat-destination");

    const button =
      $("lxmf-chat-send");

    const status =
      $("lxmf-chat-status");

    const peer =
      String(destination?.value || "").trim();

    const content =
      String(input?.value || "").trim();

    if (!peer) {
      if (status) {
        status.textContent =
          "Kein Kontakt ausgewählt.";
      }
      return;
    }

    if (!content) {
      return;
    }

    if (button) {
      button.disabled = true;
    }

    if (status) {
      status.textContent =
        "Wird gesendet…";
    }

    try {
      const response =
        await fetch(
          "api/node/lxmf/send",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              destination_hash: peer,
              content,
              title: "Home Assistant"
            }),
            cache: "no-store"
          }
        );

      const data =
        await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.error ||
          "Versand fehlgeschlagen"
        );
      }

      if (input) {
        input.value = "";
      }

      if (status) {
        status.textContent =
          "Nachricht ausgehend";
      }

      setTimeout(() => {
        window.reticulumConversation097
          ?.render(true);
      }, 300);

      setTimeout(() => {
        window.reticulumConversation097
          ?.render(true);

        window.reticulumMessengerChats097
          ?.refresh();
      }, 1500);

    } catch (error) {
      console.error(
        "[Messenger 0.97] send",
        error
      );

      if (status) {
        status.textContent =
          "Versand fehlgeschlagen";
      }

    } finally {
      if (button) {
        button.disabled = false;
      }

      setTimeout(() => {
        if (status) {
          status.textContent = "";
        }
      }, 4000);
    }
  }

  function init() {
    const button =
      $("lxmf-chat-send");

    const input =
      $("lxmf-chat-content");

    if (button) {
      button.onclick =
        sendMessage;
    }

    if (input) {
      input.addEventListener(
        "keydown",
        event => {
          if (
            event.key === "Enter" &&
            !event.shiftKey
          ) {
            event.preventDefault();
            sendMessage();
          }
        }
      );
    }
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once:true}
    );
  } else {
    init();
  }

  window.reticulumSend097 = {
    send: sendMessage
  };
})();

/* =====================================================
   0.97.3 · MOBILE NAVIGATION
   ===================================================== */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  function isMobile() {
    return window.matchMedia(
      "(max-width: 700px)"
    ).matches;
  }

  function showList() {
    if (!isMobile()) return;

    const list = $("messenger-app");

    const chat =
      document.querySelector(
        ".messenger-conversation"
      );

    if (list) {
      list.style.setProperty(
        "display",
        "block",
        "important"
      );

      list.classList.remove(
        "m97-chat-open"
      );
    }

    if (chat) {
      chat.style.setProperty(
        "display",
        "none",
        "important"
      );
    }
  }

  function showConversation() {
    if (!isMobile()) return;

    const list = $("messenger-app");

    const chat =
      document.querySelector(
        ".messenger-conversation"
      );

    if (list) {
      list.style.setProperty(
        "display",
        "block",
        "important"
      );

      list.classList.add(
        "m97-chat-open"
      );
    }

    if (chat) {
      chat.style.setProperty(
        "display",
        "flex",
        "important"
      );
    }
  }

  const oldOpen =
    window.openMessengerConversation;

  if (
    typeof oldOpen === "function"
  ) {
    window.openMessengerConversation =
      function(peer) {
        oldOpen(peer);
        showConversation();
      };
  }

  function init() {
    const back =
      $("messenger-back");

    if (back) {
      back.onclick = event => {
        event.preventDefault();
        showList();
      };
    }

    if (isMobile()) {
      showList();
    }

    window.addEventListener(
      "popstate",
      () => {
        if (isMobile()) {
          showList();
        }
      }
    );
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once:true}
    );
  } else {
    init();
  }

  window.reticulumMobile097 = {
    showList,
    showConversation,
    isMobile
  };
})();

/* =====================================================
   0.97.4 · RETURN TO SOURCE TAB
   ===================================================== */

(() => {
  "use strict";

  let sourceTab = "chats";

  function rememberSourceTab() {
    const active =
      document.querySelector(
        "[data-msg-tab].active"
      );

    sourceTab =
      active?.dataset?.msgTab || "chats";
  }

  const oldOpen =
    window.openMessengerConversation;

  if (
    typeof oldOpen === "function"
  ) {
    window.openMessengerConversation =
      function(peer) {
        rememberSourceTab();
        oldOpen(peer);
      };
  }

  const oldShowList =
    window.reticulumMobile097?.showList;

  function restoreSourceTab() {
    if (
      window.reticulumMessenger097 &&
      typeof window.reticulumMessenger097.selectTab
        === "function"
    ) {
      window.reticulumMessenger097.selectTab(
        sourceTab
      );
    }
  }

  if (
    window.reticulumMobile097 &&
    typeof oldShowList === "function"
  ) {
    window.reticulumMobile097.showList =
      function() {
        oldShowList();
        restoreSourceTab();
      };
  }

  const back =
    document.getElementById(
      "messenger-back"
    );

  if (back) {
    back.onclick = event => {
      event.preventDefault();

      if (
        window.reticulumMobile097?.showList
      ) {
        window.reticulumMobile097.showList();
      }

      restoreSourceTab();
    };
  }

  window.reticulumReturn0974 = {
    get sourceTab() {
      return sourceTab;
    }
  };
})();

/* =====================================================
   0.98.0 · BETA UX CORE
   ===================================================== */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  let contactNames = new Map();
  let refreshTimer = null;

  function clean(value) {
    return String(value || "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim();
  }

  async function loadContactNames() {
    try {
      const response = await fetch(
        "api/messenger/contacts?ts=" + Date.now(),
        {cache:"no-store"}
      );

      if (!response.ok) return;

      const data = await response.json();

      const contacts =
        Array.isArray(data?.contacts)
          ? data.contacts
          : [];

      contactNames = new Map();

      contacts.forEach(contact => {
        const peer =
          String(contact.destination_hash || "");

        let name =
          clean(contact.display_name);

        if (
          !name ||
          name === "Anonymous Peer" ||
          name.includes("\uFFFD")
        ) {
          name =
            "Kontakt " +
            peer.slice(0,6).toUpperCase();
        }

        contactNames.set(peer, name);
      });

    } catch (_) {}
  }

  function applyChatHeader(peer) {
    peer = String(peer || "").trim();

    if (!peer) return;

    const name =
      contactNames.get(peer) ||
      "Kontakt " +
      peer.slice(0,6).toUpperCase();

    const title =
      $("lxmf-chat-name");

    const sub =
      $("lxmf-chat-peer");

    const avatar =
      $("lxmf-chat-avatar");

    if (title) {
      title.textContent = name;
    }

    if (sub) {
      sub.textContent =
        "Reticulum · LXMF";
      sub.title = peer;
    }

    if (avatar) {
      avatar.textContent =
        (name[0] || "?").toUpperCase();
    }
  }

  function installSearch() {
    const app =
      $("messenger-app");

    const tabs =
      app?.querySelector(".msg-tabs");

    if (!app || !tabs) return;

    if ($("m98-search")) return;

    const wrap =
      document.createElement("div");

    wrap.id = "m98-search-wrap";

    wrap.innerHTML = `
      <input
        id="m98-search"
        type="search"
        autocomplete="off"
        placeholder="Chats und Kontakte durchsuchen…"
      >
    `;

    tabs.insertAdjacentElement(
      "afterend",
      wrap
    );

    const input =
      $("m98-search");

    input.addEventListener(
      "input",
      () => {
        const query =
          input.value
            .trim()
            .toLowerCase();

        document
          .querySelectorAll(
            "#messenger-chat-list .messenger-contact," +
            "#msg-contact-list .messenger-contact"
          )
          .forEach(item => {
            const text =
              item.textContent
                .toLowerCase();

            item.style.display =
              !query ||
              text.includes(query)
                ? ""
                : "none";
          });
      }
    );
  }

  function installTabMemory() {
    document
      .querySelectorAll("[data-msg-tab]")
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            localStorage.setItem(
              "reticulum-messenger-tab",
              button.dataset.msgTab
            );

            const search =
              $("m98-search");

            if (search) {
              search.value = "";
              search.dispatchEvent(
                new Event("input")
              );
            }
          }
        );
      });

    const saved =
      localStorage.getItem(
        "reticulum-messenger-tab"
      );

    if (
      saved &&
      window.reticulumMessenger097
        ?.selectTab
    ) {
      window.reticulumMessenger097
        .selectTab(saved);
    }
  }

  function installComposer() {
    const input =
      $("lxmf-chat-content");

    if (!input) return;

    function resize() {
      input.style.height = "auto";

      input.style.height =
        Math.min(
          input.scrollHeight,
          140
        ) + "px";
    }

    input.addEventListener(
      "input",
      resize
    );

    resize();
  }

  function installOpenHook() {
    const oldOpen =
      window.openMessengerConversation;

    if (
      typeof oldOpen !== "function"
    ) return;

    window.openMessengerConversation =
      function(peer) {

        oldOpen(peer);

        applyChatHeader(peer);

        loadContactNames().then(() => {
          applyChatHeader(peer);
        });
      };
  }

  function startLiveRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }

    refreshTimer =
      setInterval(() => {

        const peer =
          window.reticulumConversation097
            ?.activePeer;

        if (!peer) return;

        window.reticulumConversation097
          ?.render(false);

      }, 5000);
  }

  async function init() {
    await loadContactNames();

    installSearch();
    installTabMemory();
    installComposer();
    installOpenHook();
    startLiveRefresh();

    console.info(
      "[Reticulum Messenger] 0.98 Beta UX ready"
    );
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once:true}
    );
  } else {
    init();
  }

  window.reticulumBeta098 = {
    loadContactNames,
    applyChatHeader
  };
})();

/* =====================================================
   0.99.0 · PROFILE / IDENTITY / ANNOUNCE
   ===================================================== */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  function shortHash(value) {
    const v = String(value || "");
    if (!v) return "—";
    if (v.length <= 20) return v;
    return v.slice(0,10) + "…" + v.slice(-8);
  }

  async function loadIdentity() {
    const root =
      $("msg-settings-view");

    if (!root) return;

    let panel =
      $("m99-profile-panel");

    if (!panel) {
      panel =
        document.createElement("div");

      panel.id =
        "m99-profile-panel";

      panel.className =
        "m99-profile-panel";

      root.appendChild(panel);
    }

    panel.innerHTML = `
      <div class="m99-loading">
        Messenger-Profil wird geladen…
      </div>
    `;

    try {
      const response =
        await fetch(
          "api/node/identity?ts=" +
          Date.now(),
          {cache:"no-store"}
        );

      const data =
        await response.json();

      const name =
        String(
          data?.lxmf_display_name ||
          "Home Assistant"
        );

      const identity =
        String(
          data?.identity_hash || ""
        );

      const destination =
        String(
          data?.lxmf_destination_hash || ""
        );

      const lastAnnounce =
        Number(
          data?.lxmf_last_announce || 0
        );

      let announceText =
        "Noch kein LXMF-Announce";

      if (lastAnnounce) {
        announceText =
          new Date(
            lastAnnounce * 1000
          ).toLocaleString("de-DE");
      }

      panel.innerHTML = `
        <div class="m99-card">

          <div class="m99-title">
            Mein Messenger
          </div>

          <label class="m99-label">
            Anzeigename
          </label>

          <div class="m99-name-row">
            <input
              id="m99-name"
              type="text"
              maxlength="40"
              value="${escapeHtml(name)}"
            >

            <button
              id="m99-save"
              type="button"
            >
              Speichern
            </button>
          </div>

          <div
            id="m99-save-status"
            class="m99-status"
          ></div>

          <div class="m99-separator"></div>

          <div class="m99-meta">
            <span>Identity</span>
            <strong title="${escapeHtml(identity)}">
              ${escapeHtml(shortHash(identity))}
            </strong>
          </div>

          <div class="m99-meta">
            <span>LXMF Destination</span>
            <strong title="${escapeHtml(destination)}">
              ${escapeHtml(shortHash(destination))}
            </strong>
          </div>

          <div class="m99-meta">
            <span>Letzter Announce</span>
            <strong>
              ${escapeHtml(announceText)}
            </strong>
          </div>

          <button
            id="m99-announce"
            type="button"
            class="m99-announce"
          >
            Jetzt announcen
          </button>

          <div
            id="m99-announce-status"
            class="m99-status"
          ></div>

        </div>
      `;

      bindProfileActions();

    } catch (error) {
      panel.innerHTML = `
        <div class="m99-error">
          Profil derzeit nicht verfügbar.
        </div>
      `;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function bindProfileActions() {
    const save =
      $("m99-save");

    const announce =
      $("m99-announce");

    if (save) {
      save.onclick =
        saveProfile;
    }

    if (announce) {
      announce.onclick =
        sendAnnounce;
    }
  }

  async function saveProfile() {
    const input =
      $("m99-name");

    const status =
      $("m99-save-status");

    const name =
      String(
        input?.value || ""
      ).trim();

    if (!name) {
      if (status) {
        status.textContent =
          "Name darf nicht leer sein.";
      }
      return;
    }

    if (status) {
      status.textContent =
        "Wird gespeichert…";
    }

    try {
      const response =
        await fetch(
          "api/messenger/profile",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              name
            }),
            cache: "no-store"
          }
        );

      const data =
        await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.error ||
          "Speichern fehlgeschlagen"
        );
      }

      if (status) {
        status.textContent =
          "Gespeichert. Add-on neu starten, damit der neue Name aktiv wird.";
      }

    } catch (error) {
      if (status) {
        status.textContent =
          "Speichern fehlgeschlagen: " +
          error.message;
      }
    }
  }

  async function sendAnnounce() {
    const status =
      $("m99-announce-status");

    if (status) {
      status.textContent =
        "Announce wird angefordert…";
    }

    try {
      const response =
        await fetch(
          "api/node/lxmf/announce",
          {
            method: "POST",
            cache: "no-store"
          }
        );

      const data =
        await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.error ||
          "Announce fehlgeschlagen"
        );
      }

      if (status) {
        status.textContent =
          "Announce angefordert.";
      }

      setTimeout(
        loadIdentity,
        1500
      );

    } catch (error) {
      if (status) {
        status.textContent =
          "Announce fehlgeschlagen: " +
          error.message;
      }
    }
  }

  function hookSettingsTab() {
    document
      .querySelectorAll(
        '[data-msg-tab="settings"]'
      )
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            setTimeout(
              loadIdentity,
              50
            );
          }
        );
      });
  }

  function init() {
    hookSettingsTab();
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once:true}
    );
  } else {
    init();
  }

  window.reticulumProfile099 = {
    loadIdentity,
    saveProfile,
    sendAnnounce
  };
})();

/* =====================================================
   1.00.0-beta2 · VISIBLE VERSION
   ===================================================== */

(() => {
  "use strict";

  function showVersion() {
    const brand =
      document.getElementById(
        "n2k-messenger-brand"
      );

    if (!brand) return;

    if (
      document.getElementById(
        "n2k-messenger-version"
      )
    ) return;

    const version =
      document.createElement("div");

    version.id =
      "n2k-messenger-version";

    version.textContent =
      "Reticulum Messenger · 1.00 Beta 2";

    brand.appendChild(version);
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      () => setTimeout(showVersion, 50),
      {once:true}
    );
  } else {
    setTimeout(showVersion, 50);
  }
})();

/* =====================================================
   1.00.0-beta3 · GLOBAL BRAND HEADER
   ===================================================== */

(() => {
  "use strict";

  function initGlobalBrand() {
    if (document.getElementById("n2k-global-brand")) {
      return;
    }

    const main =
      document.querySelector("main") ||
      document.body;

    if (!main) return;

    const brand =
      document.createElement("div");

    brand.id = "n2k-global-brand";

    brand.innerHTML = `
      <div class="n2k-global-title">
        Netfreak2k
      </div>

      <div class="n2k-global-sub">
        Offgrid Mesh Local Intelligence
      </div>

      <div class="n2k-global-version">
        Reticulum · 1.00 Beta 3
      </div>
    `;

    main.prepend(brand);
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initGlobalBrand,
      {once:true}
    );
  } else {
    initGlobalBrand();
  }
})();

/* =====================================================
   1.01.0-dev · LIVE STATUS / OFFLINE / UNREAD
   ===================================================== */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const state = {
    online: false,
    lastOk: 0,
    unread: 0,
    timer: null
  };

  function ensureStatusBar() {
    if ($("m101-live")) return;

    const brand =
      $("n2k-global-brand") ||
      $("messenger-app");

    if (!brand) return;

    const bar =
      document.createElement("div");

    bar.id = "m101-live";

    bar.innerHTML = `
      <span
        id="m101-dot"
        class="m101-dot"
      ></span>

      <span id="m101-state">
        Verbindung wird geprüft…
      </span>

      <span
        id="m101-time"
        class="m101-time"
      ></span>
    `;

    brand.appendChild(bar);
  }

  function formatTime(timestamp) {
    if (!timestamp) return "";

    return new Date(timestamp)
      .toLocaleTimeString(
        "de-DE",
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }
      );
  }

  function renderStatus() {
    ensureStatusBar();

    const dot = $("m101-dot");
    const label = $("m101-state");
    const time = $("m101-time");

    if (!dot || !label || !time) return;

    dot.classList.toggle(
      "online",
      state.online
    );

    dot.classList.toggle(
      "offline",
      !state.online
    );

    if (state.online) {
      label.textContent =
        "Reticulum online";

      time.textContent =
        "Aktualisiert " +
        formatTime(state.lastOk);
    } else {
      label.textContent =
        "Verbindung unterbrochen";

      time.textContent =
        state.lastOk
          ? "Letzter Kontakt " +
            formatTime(state.lastOk)
          : "";
    }
  }

  async function checkStatus() {
    try {
      const response =
        await fetch(
          "api/status?ts=" + Date.now(),
          {
            cache: "no-store"
          }
        );

      if (!response.ok) {
        throw new Error(
          "HTTP " + response.status
        );
      }

      const data =
        await response.json();

      state.online =
        data?.online !== false &&
        data?.status !== "offline";

      state.lastOk =
        Date.now();

    } catch (_) {
      state.online = false;
    }

    renderStatus();
  }

  function updateUnreadUI(total) {
    total =
      Math.max(
        0,
        Number(total || 0)
      );

    state.unread = total;

    const chatTab =
      document.querySelector(
        '[data-msg-tab="chats"]'
      );

    if (chatTab) {
      const label =
        chatTab.querySelector(
          ".m101-chat-label"
        );

      if (label) {
        label.textContent =
          total > 0
            ? `Chats (${total})`
            : "Chats";
      } else {
        const spans =
          chatTab.querySelectorAll("span");

        const text =
          spans[spans.length - 1];

        if (text) {
          text.classList.add(
            "m101-chat-label"
          );

          text.textContent =
            total > 0
              ? `Chats (${total})`
              : "Chats";
        }
      }
    }

    document.title =
      total > 0
        ? `(${total}) Reticulum`
        : "Reticulum";
  }

  async function refreshUnread() {
    try {
      const response =
        await fetch(
          "api/messenger?ts=" +
          Date.now(),
          {
            cache: "no-store"
          }
        );

      if (!response.ok) return;

      const data =
        await response.json();

      const chats =
        Array.isArray(
          data?.conversations
        )
          ? data.conversations
          : [];

      const total =
        chats.reduce(
          (sum, chat) =>
            sum +
            Math.max(
              0,
              Number(
                chat?.unread || 0
              )
            ),
          0
        );

      updateUnreadUI(total);

    } catch (_) {
      /* Statusprüfung kümmert sich
         um Offline-Anzeige. */
    }
  }

  function refreshAll() {
    checkStatus();
    refreshUnread();

    if (
      window
        .reticulumMessengerChats097
        ?.refresh
    ) {
      window
        .reticulumMessengerChats097
        .refresh();
    }

    const peer =
      window
        .reticulumConversation097
        ?.activePeer;

    if (peer) {
      window
        .reticulumConversation097
        ?.render(false);
    }
  }

  function init() {
    ensureStatusBar();

    refreshAll();

    if (state.timer) {
      clearInterval(state.timer);
    }

    state.timer =
      setInterval(
        refreshAll,
        10000
      );

    window.addEventListener(
      "online",
      refreshAll
    );

    window.addEventListener(
      "offline",
      () => {
        state.online = false;
        renderStatus();
      }
    );

    console.info(
      "[Reticulum Messenger] 1.01 live core ready"
    );
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once:true}
    );
  } else {
    init();
  }

  window.reticulumLive101 = {
    state,
    refresh: refreshAll
  };
})();

/* =====================================================
   1.02.0-dev · REAL UNREAD / READ STATE
   ===================================================== */

(() => {
  "use strict";

  async function markRead(peer) {
    peer = String(peer || "").trim();

    if (!peer) return;

    try {
      const response =
        await fetch(
          "api/messenger/read",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              peer_hash: peer
            }),
            cache: "no-store"
          }
        );

      const data =
        await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.error ||
          "Read-State fehlgeschlagen"
        );
      }

      window
        .reticulumMessengerChats097
        ?.refresh();

      window
        .reticulumLive101
        ?.refresh();

    } catch (error) {
      console.error(
        "[Messenger 1.02] mark read",
        error
      );
    }
  }

  /*
   * Hook current conversation opener.
   */
  const oldOpen =
    window.openMessengerConversation;

  if (
    typeof oldOpen === "function"
  ) {
    window.openMessengerConversation =
      function(peer) {

        oldOpen(peer);

        /*
         * Erst nach Öffnen markieren,
         * damit die Nachricht sichtbar war.
         */
        setTimeout(
          () => markRead(peer),
          250
        );
      };
  }

  /*
   * Enhance existing chat renderer
   * without replacing the 0.97 core.
   */
  function enhanceChatList() {
    const root =
      document.getElementById(
        "messenger-chat-list"
      );

    if (!root) return;

    root
      .querySelectorAll(
        ".messenger-contact"
      )
      .forEach(item => {

        const badge =
          item.querySelector(
            ".m80-unread"
          );

        item.classList.toggle(
          "m102-unread-chat",
          Boolean(badge)
        );

        if (badge) {
          badge.classList.add(
            "m102-unread-badge"
          );
        }
      });
  }

  /*
   * Watch only the chat list.
   * No text rewriting -> no observer loop.
   */
  function installListObserver() {
    const root =
      document.getElementById(
        "messenger-chat-list"
      );

    if (!root) return;

    enhanceChatList();

    const observer =
      new MutationObserver(
        enhanceChatList
      );

    observer.observe(
      root,
      {
        childList: true,
        subtree: true
      }
    );
  }

  /*
   * Force newest activity first.
   * Backend already sorts this way;
   * this is a frontend safety net.
   */
  async function refreshSorted() {
    try {
      const response =
        await fetch(
          "api/messenger?ts=" +
          Date.now(),
          {
            cache: "no-store"
          }
        );

      if (!response.ok) return;

      const data =
        await response.json();

      const chats =
        Array.isArray(
          data?.conversations
        )
          ? data.conversations
          : [];

      chats.sort(
        (a, b) =>
          Number(
            b?.last_timestamp || 0
          ) -
          Number(
            a?.last_timestamp || 0
          )
      );

      /*
       * Existing renderer still owns HTML.
       * Trigger normal refresh after backend
       * state changed.
       */
      window
        .reticulumMessengerChats097
        ?.refresh();

    } catch (_) {}
  }

  function init() {
    installListObserver();

    setInterval(
      enhanceChatList,
      5000
    );

    setInterval(
      refreshSorted,
      15000
    );

    console.info(
      "[Reticulum Messenger] 1.02 unread core ready"
    );
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once:true}
    );
  } else {
    init();
  }

  window.reticulumUnread102 = {
    markRead,
    refreshSorted
  };
})();

/* =====================================================
   1.02.1-dev · CHAT OPEN FIX
   ===================================================== */

(() => {
  "use strict";

  const oldOpen =
    window.openMessengerConversation;

  if (typeof oldOpen !== "function") {
    console.error(
      "[Messenger 1.02.1] open function missing"
    );
    return;
  }

  window.openMessengerConversation =
    function(peer) {

      oldOpen(peer);

      const app =
        document.getElementById(
          "messenger-app"
        );

      const conversation =
        document.querySelector(
          ".messenger-conversation"
        );

      if (app) {
        app.style.setProperty(
          "display",
          "block",
          "important"
        );

        app.classList.add(
          "m97-chat-open"
        );
      }

      if (conversation) {
        conversation.style.setProperty(
          "display",
          "flex",
          "important"
        );
      }

      console.info(
        "[Messenger 1.02.1] chat opened",
        peer
      );
    };

})();

/* =====================================================
   1.03.0-dev · RETICULUM LIVE NODE MAP
   ===================================================== */

(() => {
  "use strict";

  const SVG_NS =
    "http://www.w3.org/2000/svg";

  let lastSignature = "";
  let timer = null;

  function shortHash(value) {
    const text =
      String(value || "");

    if (!text) return "—";

    return text.length > 10
      ? text.slice(0, 6) + "…" +
        text.slice(-4)
      : text;
  }

  function svgElement(name, attrs = {}) {
    const el =
      document.createElementNS(
        SVG_NS,
        name
      );

    Object.entries(attrs)
      .forEach(([key, value]) => {
        el.setAttribute(
          key,
          String(value)
        );
      });

    return el;
  }

  function ensureUI() {
    if (
      document.getElementById(
        "n2k-network-viz"
      )
    ) return true;

    const network =
      document.getElementById(
        "reticulum-network"
      );

    const table =
      network?.querySelector(
        ".network-table-wrap"
      );

    if (!network || !table) {
      return false;
    }

    const wrap =
      document.createElement("div");

    wrap.id =
      "n2k-network-viz";

    wrap.innerHTML = `
      <div class="n2k-viz-head">
        <div>
          <div class="n2k-viz-title">
            Live Mesh
          </div>

          <div class="n2k-viz-sub">
            Reticulum Pfade · live
          </div>
        </div>

        <span id="n2k-viz-count">
          0 Nodes
        </span>
      </div>

      <div class="n2k-viz-stage">
        <svg
          id="n2k-viz-svg"
          viewBox="0 0 600 360"
          role="img"
          aria-label="Reticulum Netzwerk"
        ></svg>
      </div>

      <div
        id="n2k-viz-detail"
        class="n2k-viz-detail"
      >
        Node antippen für Details
      </div>
    `;

    table.parentNode.insertBefore(
      wrap,
      table
    );

    return true;
  }

  function showDetail(path) {
    const detail =
      document.getElementById(
        "n2k-viz-detail"
      );

    if (!detail) return;

    detail.innerHTML = `
      <strong>
        ${shortHash(path.destination)}
      </strong>

      <span>
        Hops:
        ${path.hops ?? "—"}
      </span>

      <span>
        Interface:
        ${String(path.interface || "—")}
      </span>

      <span>
        Next Hop:
        ${shortHash(path.next_hop)}
      </span>
    `;
  }

  function render(paths) {
    if (!ensureUI()) return;

    const svg =
      document.getElementById(
        "n2k-viz-svg"
      );

    const count =
      document.getElementById(
        "n2k-viz-count"
      );

    if (!svg) return;

    svg.replaceChildren();

    const defs =
      svgElement("defs");

    const gradient =
      svgElement(
        "linearGradient",
        {
          id: "n2k-link-gradient",
          x1: "0%",
          y1: "0%",
          x2: "100%",
          y2: "100%"
        }
      );

    const stop1 =
      svgElement(
        "stop",
        {
          offset: "0%",
          "stop-color": "#56a8ff"
        }
      );

    const stop2 =
      svgElement(
        "stop",
        {
          offset: "50%",
          "stop-color": "#b57dff"
        }
      );

    const stop3 =
      svgElement(
        "stop",
        {
          offset: "100%",
          "stop-color": "#59dca4"
        }
      );

    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    gradient.appendChild(stop3);

    defs.appendChild(gradient);
    svg.appendChild(defs);

    const nodes =
      paths
        .filter(
          p => p &&
          p.destination
        )
        .slice(0, 12);

    if (count) {
      count.textContent =
        nodes.length +
        (nodes.length === 1
          ? " Node"
          : " Nodes");
    }

    const cx = 300;
    const cy = 180;

    /*
     * Animated path lines first,
     * so nodes stay above them.
     */
    nodes.forEach((path, index) => {
      const angle =
        (Math.PI * 2 * index) /
        Math.max(nodes.length, 1)
        - Math.PI / 2;

      const hops =
        Math.max(
          1,
          Math.min(
            Number(path.hops || 1),
            8
          )
        );

      const radius =
        105 + hops * 8;

      const x =
        cx + Math.cos(angle) * radius;

      const y =
        cy + Math.sin(angle) * radius;

      const line =
        svgElement(
          "line",
          {
            x1: cx,
            y1: cy,
            x2: x,
            y2: y,
            class:
              "n2k-viz-link"
          }
        );

      line.style.animationDelay =
        `${index * 0.12}s`;

      svg.appendChild(line);
    });

    /*
     * Local Home Assistant node.
     */
    const core =
      svgElement(
        "g",
        {
          class:
            "n2k-viz-core"
        }
      );

    const corePulse =
      svgElement(
        "circle",
        {
          cx,
          cy,
          r: 30,
          class:
            "n2k-viz-core-pulse"
        }
      );

    const coreCircle =
      svgElement(
        "circle",
        {
          cx,
          cy,
          r: 22,
          class:
            "n2k-viz-core-circle"
        }
      );

    const coreText =
      svgElement(
        "text",
        {
          x: cx,
          y: cy + 4,
          "text-anchor": "middle",
          class:
            "n2k-viz-core-text"
        }
      );

    coreText.textContent = "HA";

    core.appendChild(corePulse);
    core.appendChild(coreCircle);
    core.appendChild(coreText);

    svg.appendChild(core);

    /*
     * Remote Reticulum destinations.
     */
    nodes.forEach((path, index) => {
      const angle =
        (Math.PI * 2 * index) /
        Math.max(nodes.length, 1)
        - Math.PI / 2;

      const hops =
        Math.max(
          1,
          Math.min(
            Number(path.hops || 1),
            8
          )
        );

      const radius =
        105 + hops * 8;

      const x =
        cx + Math.cos(angle) * radius;

      const y =
        cy + Math.sin(angle) * radius;

      const group =
        svgElement(
          "g",
          {
            class:
              "n2k-viz-node",
            tabindex: "0",
            "data-hop": String(
              path.hops ?? 0
            )
          }
        );

      const circle =
        svgElement(
          "circle",
          {
            cx: x,
            cy: y,
            r: 15
          }
        );

      const label =
        svgElement(
          "text",
          {
            x,
            y: y + 31,
            "text-anchor": "middle"
          }
        );

      label.textContent =
        shortHash(
          path.destination
        );

      const hopsLabel =
        svgElement(
          "text",
          {
            x,
            y: y + 4,
            "text-anchor": "middle",
            class:
              "n2k-viz-hop"
          }
        );

      hopsLabel.textContent =
        String(
          path.hops ?? "?"
        );

      group.appendChild(circle);
      group.appendChild(hopsLabel);
      group.appendChild(label);

      group.addEventListener(
        "click",
        () => showDetail(path)
      );

      group.addEventListener(
        "keydown",
        event => {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            showDetail(path);
          }
        }
      );

      svg.appendChild(group);
    });
  }

  async function refresh() {
    try {
      if (!ensureUI()) return;

      const response =
        await fetch(
          "api/network?ts=" +
          Date.now(),
          {
            cache: "no-store"
          }
        );

      if (!response.ok) return;

      const data =
        await response.json();

      const paths =
        Array.isArray(
          data?.paths
        )
          ? data.paths
          : [];

      const visible =
        paths.slice(0, 12);

      const signature =
        JSON.stringify(
          visible.map(
            p => [
              p.destination,
              p.hops,
              p.next_hop,
              p.interface
            ]
          )
        );

      if (
        signature ===
        lastSignature
      ) return;

      lastSignature =
        signature;

      render(visible);

    } catch (error) {
      console.error(
        "[Reticulum 1.03] node map",
        error
      );
    }
  }

  function init() {
    ensureUI();
    refresh();

    timer =
      setInterval(
        refresh,
        10000
      );

    console.info(
      "[Reticulum] 1.03 Live Mesh ready"
    );
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once:true}
    );
  } else {
    init();
  }

  window.reticulumMesh103 = {
    refresh
  };
})();

/* =====================================================
   1.04.0-dev · CONTACT FAVORITES + HASH SEARCH
   ===================================================== */

(() => {
  "use strict";

  const KEY =
    "reticulum-messenger-favorites";

  function loadFavorites() {
    try {
      const raw =
        localStorage.getItem(KEY);

      const data =
        JSON.parse(raw || "[]");

      return new Set(
        Array.isArray(data)
          ? data.map(String)
          : []
      );
    } catch (_) {
      return new Set();
    }
  }

  function saveFavorites(set) {
    localStorage.setItem(
      KEY,
      JSON.stringify(
        [...set]
      )
    );
  }

  function isFavorite(peer) {
    return loadFavorites()
      .has(String(peer || ""));
  }

  function toggleFavorite(peer) {
    peer =
      String(peer || "").trim();

    if (!peer) return;

    const favorites =
      loadFavorites();

    if (favorites.has(peer)) {
      favorites.delete(peer);
    } else {
      favorites.add(peer);
    }

    saveFavorites(favorites);

    decorateContacts();
  }

  function decorateContacts() {
    const root =
      document.getElementById(
        "msg-contact-list"
      );

    if (!root) return;

    const favorites =
      loadFavorites();

    const contacts =
      [...root.querySelectorAll(
        ".messenger-contact[data-m97-peer]"
      )];

    contacts.forEach(item => {
      const peer =
        String(
          item.dataset.m97Peer || ""
        );

      item.dataset.m104Search =
        (
          item.textContent +
          " " +
          peer
        ).toLowerCase();

      const favorite =
        favorites.has(peer);

      item.classList.toggle(
        "m104-favorite-contact",
        favorite
      );

      let star =
        item.querySelector(
          ".m104-favorite"
        );

      if (!star) {
        star =
          document.createElement(
            "span"
          );

        star.className =
          "m104-favorite";

        star.setAttribute(
          "role",
          "button"
        );

        star.setAttribute(
          "tabindex",
          "0"
        );

        star.addEventListener(
          "click",
          event => {
            event.preventDefault();
            event.stopPropagation();

            toggleFavorite(peer);
          }
        );

        star.addEventListener(
          "keydown",
          event => {
            if (
              event.key === "Enter" ||
              event.key === " "
            ) {
              event.preventDefault();
              event.stopPropagation();

              toggleFavorite(peer);
            }
          }
        );

        item.appendChild(star);
      }

      star.textContent =
        favorite ? "★" : "☆";

      star.title =
        favorite
          ? "Favorit entfernen"
          : "Als Favorit markieren";

      star.setAttribute(
        "aria-label",
        star.title
      );
    });

    /*
     * Favoriten zuerst.
     * Innerhalb der Gruppen bleibt
     * die bestehende Reihenfolge erhalten.
     */
    contacts
      .sort((a, b) => {
        const af =
          favorites.has(
            String(
              a.dataset.m97Peer || ""
            )
          )
            ? 1
            : 0;

        const bf =
          favorites.has(
            String(
              b.dataset.m97Peer || ""
            )
          )
            ? 1
            : 0;

        return bf - af;
      })
      .forEach(item => {
        root.appendChild(item);
      });
  }

  function installEnhancedSearch() {
    const input =
      document.getElementById(
        "m98-search"
      );

    if (!input) return;

    if (
      input.dataset.m104Enhanced === "1"
    ) return;

    input.dataset.m104Enhanced = "1";

    input.placeholder =
      "Name oder Reticulum-Hash suchen…";

    input.addEventListener(
      "input",
      () => {
        const query =
          input.value
            .trim()
            .toLowerCase();

        document
          .querySelectorAll(
            "#msg-contact-list " +
            ".messenger-contact"
          )
          .forEach(item => {

            const peer =
              String(
                item.dataset.m97Peer || ""
              ).toLowerCase();

            const text =
              String(
                item.dataset.m104Search ||
                item.textContent ||
                ""
              ).toLowerCase();

            item.style.display =
              !query ||
              text.includes(query) ||
              peer.includes(query)
                ? ""
                : "none";
          });
      }
    );
  }

  function init() {
    decorateContacts();
    installEnhancedSearch();

    /*
     * Kein MutationObserver:
     * vermeidet frühere Observer-Loops.
     */
    setInterval(
      () => {
        decorateContacts();
        installEnhancedSearch();
      },
      2000
    );

    console.info(
      "[Messenger] 1.04 contact UX ready"
    );
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once:true}
    );
  } else {
    init();
  }

  window.reticulumContacts104 = {
    toggleFavorite,
    decorateContacts
  };
})();
