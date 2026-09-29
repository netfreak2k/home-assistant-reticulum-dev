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
        "none",
        "important"
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
