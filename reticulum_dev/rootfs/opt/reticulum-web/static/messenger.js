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

  const N2K_PHOTO_PREFIX = "N2KPHOTO/1|image/jpeg|";

  function isPhotoContent(value) {
    return String(value || "").startsWith(N2K_PHOTO_PREFIX);
  }

  function renderMessageContent(value) {
    const content = String(value || "");

    if (!isPhotoContent(content)) {
      return esc(content);
    }

    const b64 = content.slice(N2K_PHOTO_PREFIX.length);

    if (
      !b64 ||
      b64.length > 40000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)
    ) {
      return '<span class="n2k-photo-invalid">📷 Foto konnte nicht angezeigt werden</span>';
    }

    return '<img class="n2k-chat-photo" alt="Gesendetes Foto" loading="lazy" ' +
      'src="data:image/jpeg;base64,' + b64 + '">';
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

  function contactAge(timestamp) {
    const value = Number(timestamp || 0);
    if (!value) return "zuletzt: unbekannt";

    const age = Math.max(
      0,
      Math.floor(Date.now() / 1000) - value
    );

    if (age < 60) return "vor " + age + " s";
    if (age < 3600) return "vor " + Math.round(age / 60) + " min";
    if (age < 86400) return "vor " + Math.round(age / 3600) + " h";
    return "vor " + Math.round(age / 86400) + " d";
  }

  function contactMeta(contact, peer) {
    const parts = ["LXMF", contactAge(contact?.last_seen)];

    const source =
      String(
        contact?.discovery_source ||
        contact?.source ||
        ""
      ).trim();

    if (source === "known_destinations_cache") {
      parts.push("Cache");
    } else if (source === "announce" || source === "lxmf_announce") {
      parts.push("Announce");
    }

    if (peer) {
      parts.push(
        peer.slice(0, 8) + "…" + peer.slice(-4)
      );
    }

    return parts.join(" · ");
  }

  const CONTACT_PAGE_SIZE = 4;
  let visibleContactCount = CONTACT_PAGE_SIZE;

  function removeContactMoreButton() {
    document.getElementById("m97-contact-more")?.remove();
  }

  function renderContacts(resetLimit=false) {
    const root = $("msg-contact-list");
    if (!root) return;

    if (resetLimit) {
      visibleContactCount = CONTACT_PAGE_SIZE;
    }

    removeContactMoreButton();

    if (!state.contacts.length) {
      root.innerHTML =
        '<div class="m97-empty">Keine Kontakte gefunden.</div>';
      return;
    }

    const visibleContacts =
      state.contacts.slice(0, visibleContactCount);

    root.innerHTML =
      visibleContacts.map(contact => {
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
                ${esc(contactMeta(contact, peer))}
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

    const remaining =
      state.contacts.length - visibleContacts.length;

    if (remaining > 0) {
      const more =
        document.createElement("button");

      more.id = "m97-contact-more";
      more.type = "button";
      more.className = "m97-contact-more";
      more.textContent =
        "Weitere anzeigen (" + remaining + ")";

      more.style.cssText =
        "display:block;width:calc(100% - 24px);margin:10px 12px 14px;" +
        "min-height:44px;border:1px solid rgba(255,255,255,.12);" +
        "border-radius:12px;background:rgba(255,255,255,.035);" +
        "color:#cbd3d7;font:inherit;font-weight:650;cursor:pointer;";

      more.onclick = () => {
        visibleContactCount += CONTACT_PAGE_SIZE;
        renderContacts(false);

        if (
          typeof window.reticulumContacts104?.decorateContacts
          === "function"
        ) {
          window.reticulumContacts104.decorateContacts();
        }
      };

      root.insertAdjacentElement("afterend", more);
    }
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

      const rawContacts =
        Array.isArray(data?.contacts)
          ? data.contacts
          : [];

      const uniqueContacts =
        new Map();

      rawContacts.forEach(contact => {
        const peer =
          String(contact?.destination_hash || "")
            .trim()
            .toLowerCase();

        if (!peer) return;

        const previous =
          uniqueContacts.get(peer);

        if (
          !previous ||
          Number(contact?.last_seen || 0) >=
          Number(previous?.last_seen || 0)
        ) {
          uniqueContacts.set(peer, contact);
        }
      });

      state.contacts =
        [...uniqueContacts.values()];

      state.contacts.sort(
        (a, b) =>
          Number(b?.last_seen || 0) -
          Number(a?.last_seen || 0)
      );

      renderContacts(true);

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

    const mesh =
      $("msg-mesh-view");

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

    if (mesh) {
      mesh.hidden = tab !== "mesh";
      mesh.style.setProperty(
        "display",
        tab === "mesh" ? "block" : "none",
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

      const rawPreview =
        String(chat.last_message || "Noch keine Nachrichten");

      const preview =
        rawPreview.startsWith("N2KPHOTO/1|image/jpeg|")
          ? "📷 Foto"
          : rawPreview;

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
  let lastConversationSignature = "";

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderMessageContent(value) {
    const prefix = "N2KPHOTO/1|image/jpeg|";
    const content = String(value || "");

    if (!content.startsWith(prefix)) {
      return esc(content);
    }

    const b64 = content.slice(prefix.length);

    if (
      !b64 ||
      b64.length > 40000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)
    ) {
      return '<span class="n2k-photo-invalid">📷 Foto konnte nicht angezeigt werden</span>';
    }

    return '<img class="n2k-chat-photo" alt="Gesendetes Foto" loading="lazy" ' +
      'src="data:image/jpeg;base64,' + b64 + '">';
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

      const signature =
        JSON.stringify(
          messages.map(message => [
            message.message_id || "",
            message.timestamp || 0,
            message.direction || "",
            message.delivery_status || "",
            message.delivery_method || "",
            message.delivery_updated_at || 0,
            message.content || ""
          ])
        );

      if (
        signature === lastConversationSignature &&
        box.childElementCount > 0
      ) {
        return;
      }

      lastConversationSignature = signature;

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
                  ${renderMessageContent(message.content || "")}
                </div>
                <div class="lxmf-bubble-meta">
                  ${esc(shortTime(message.timestamp))}
                  ${
                    mine
                      ? ` · <span class="m105-delivery ${
                          message.delivery_status === "delivered"
                            ? "m105-delivered"
                            : message.delivery_status === "failed"
                              ? "m105-failed"
                              : "m105-queued"
                        }">${
                          message.delivery_status === "delivered"
                            ? "zugestellt ✓✓"
                            : message.delivery_status === "propagated"
                              ? "am Propagation Node ✓"
                              : message.delivery_status === "failed"
                                ? "fehlgeschlagen ⚠"
                                : message.delivery_method === "propagated"
                                  ? "Store & Forward ⏳"
                                  : "in Übertragung …"
                        }</span>`
                      : ""
                  }
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
      const nextPeer =
        String(peer || "").trim();

      if (!nextPeer) return;

      if (nextPeer !== activePeer) {
        lastConversationSignature = "";
      }

      activePeer = nextPeer;

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
   1.19.0 · MESH PHOTO
   ===================================================== */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const PREFIX = "N2KPHOTO/1|image/jpeg|";
  const MAX_DIMENSION = 320;
  const TARGET_BYTES = 18 * 1024;
  let pendingPayload = "";
  let pendingBytes = 0;
  let pendingPeer = "";

  function dataUrlBytes(dataUrl) {
    const comma = String(dataUrl || "").indexOf(",");
    if (comma < 0) return 0;
    const b64 = dataUrl.slice(comma + 1);
    return Math.floor((b64.length * 3) / 4);
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Bild konnte nicht gelesen werden"));
      };
      img.src = url;
    });
  }

  async function compressPhoto(file) {
    if (!file || !String(file.type || "").startsWith("image/")) {
      throw new Error("Bitte ein Bild auswählen");
    }

    const img = await loadImage(file);
    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    const ratio = Math.min(1, MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));

    let width = Math.max(1, Math.round(sourceWidth * ratio));
    let height = Math.max(1, Math.round(sourceHeight * ratio));
    let quality = 0.72;
    let dataUrl = "";

    for (let attempt = 0; attempt < 10; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d", {alpha:false});
      if (!ctx) throw new Error("Bildkomprimierung nicht verfügbar");

      ctx.drawImage(img, 0, 0, width, height);
      dataUrl = canvas.toDataURL("image/jpeg", quality);

      const bytes = dataUrlBytes(dataUrl);
      if (bytes <= TARGET_BYTES) {
        return {
          payload: PREFIX + dataUrl.split(",", 2)[1],
          dataUrl,
          bytes,
          width,
          height
        };
      }

      if (quality > 0.36) {
        quality -= 0.08;
      } else {
        width = Math.max(120, Math.round(width * 0.84));
        height = Math.max(120, Math.round(height * 0.84));
        quality = 0.48;
      }
    }

    const bytes = dataUrlBytes(dataUrl);
    if (bytes > 24 * 1024) {
      throw new Error("Foto bleibt nach Komprimierung zu groß");
    }

    return {
      payload: PREFIX + dataUrl.split(",", 2)[1],
      dataUrl,
      bytes,
      width,
      height
    };
  }

  function clearPending() {
    pendingPayload = "";
    pendingBytes = 0;
    pendingPeer = "";

    const input = $("n2k-photo-input");
    const preview = $("n2k-photo-preview");
    const img = $("n2k-photo-preview-image");
    const meta = $("n2k-photo-preview-meta");

    if (input) input.value = "";
    if (img) img.removeAttribute("src");
    if (meta) meta.textContent = "";
    if (preview) preview.hidden = true;
  }

  async function choosePhoto(file) {
    const status = $("lxmf-chat-status");
    const preview = $("n2k-photo-preview");
    const img = $("n2k-photo-preview-image");
    const meta = $("n2k-photo-preview-meta");

    try {
      if (status) status.textContent = "Foto wird für Mesh komprimiert…";
      const result = await compressPhoto(file);
      pendingPayload = result.payload;
      pendingBytes = result.bytes;
      pendingPeer = String($("lxmf-chat-destination")?.value || "").trim();

      if (img) img.src = result.dataUrl;
      if (meta) {
        meta.textContent =
          result.width + "×" + result.height + " · " +
          Math.max(1, Math.round(result.bytes / 1024)) + " KB";
      }
      if (preview) preview.hidden = false;
      if (status) status.textContent = "Mesh-Foto bereit";
    } catch (error) {
      clearPending();
      if (status) status.textContent = "Foto: " + error.message;
    }
  }

  async function sendPhoto() {
    const peer = String($("lxmf-chat-destination")?.value || "").trim();
    const status = $("lxmf-chat-status");
    const send = $("n2k-photo-send");

    if (!peer) {
      if (status) status.textContent = "Kein Kontakt ausgewählt.";
      return;
    }

    if (!pendingPayload) return;

    if (pendingPeer && pendingPeer !== peer) {
      clearPending();
      if (status) status.textContent = "Foto verworfen: Kontakt wurde gewechselt.";
      return;
    }

    if (send) send.disabled = true;
    if (status) {
      status.textContent =
        "Mesh-Foto (" + Math.max(1, Math.round(pendingBytes/1024)) +
        " KB) wird über LXMF gesendet…";
    }

    try {
      const response = await fetch("api/node/lxmf/send", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          destination_hash:peer,
          content:pendingPayload,
          title:"N2K Mesh Photo"
        }),
        cache:"no-store"
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data?.error || "Versand fehlgeschlagen");
      }

      clearPending();
      if (status) status.textContent = "Foto ausgehend";

      setTimeout(() => window.reticulumConversation097?.render(true), 300);
      setTimeout(() => {
        window.reticulumConversation097?.render(true);
        window.reticulumMessengerChats097?.refresh();
      }, 1500);

    } catch (error) {
      if (status) status.textContent = "Foto-Versand fehlgeschlagen: " + error.message;
    } finally {
      if (send) send.disabled = false;
    }
  }

  function init() {
    const input = $("n2k-photo-input");
    const pick = $("n2k-photo-pick");
    const cancel = $("n2k-photo-cancel");
    const send = $("n2k-photo-send");

    if (pick) pick.addEventListener("click", () => input?.click());

    if (input) {
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (file) choosePhoto(file);
      });
    }

    if (cancel) cancel.addEventListener("click", clearPending);
    if (send) send.addEventListener("click", sendPhoto);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {once:true});
  } else {
    init();
  }
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

  const ANNOUNCE_COOLDOWN_SECONDS = 60;
  let announceCooldownTimer = null;

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

      const nowSeconds =
        Math.floor(Date.now() / 1000);

      const announceRetryAfter =
        lastAnnounce
          ? Math.max(
              0,
              ANNOUNCE_COOLDOWN_SECONDS -
              (nowSeconds - lastAnnounce)
            )
          : 0;

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
            ${announceRetryAfter > 0 ? "disabled" : ""}
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

      if (announceRetryAfter > 0) {
        startAnnounceCooldown(
          announceRetryAfter
        );
      }

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

  function formatCooldown(seconds) {
    const safeSeconds =
      Math.max(
        0,
        Math.ceil(Number(seconds) || 0)
      );

    const minutes =
      Math.floor(safeSeconds / 60);

    const rest =
      String(safeSeconds % 60)
        .padStart(2, "0");

    return minutes + ":" + rest;
  }

  function startAnnounceCooldown(seconds) {
    let remaining =
      Math.max(
        0,
        Math.ceil(Number(seconds) || 0)
      );

    if (announceCooldownTimer) {
      clearInterval(
        announceCooldownTimer
      );

      announceCooldownTimer = null;
    }

    const render = () => {
      const currentButton =
        $("m99-announce");

      const currentStatus =
        $("m99-announce-status");

      if (!currentButton) {
        if (announceCooldownTimer) {
          clearInterval(
            announceCooldownTimer
          );

          announceCooldownTimer = null;
        }

        return;
      }

      if (remaining <= 0) {
        currentButton.disabled = false;
        currentButton.textContent =
          "Jetzt announcen";

        if (
          currentStatus &&
          currentStatus.textContent.startsWith(
            "Nächster Announce in "
          )
        ) {
          currentStatus.textContent =
            "Announce wieder möglich.";
        }

        if (announceCooldownTimer) {
          clearInterval(
            announceCooldownTimer
          );

          announceCooldownTimer = null;
        }

        return;
      }

      currentButton.disabled = true;
      currentButton.textContent =
        "Cooldown " +
        formatCooldown(remaining);

      if (currentStatus) {
        currentStatus.textContent =
          "Nächster Announce in " +
          formatCooldown(remaining) +
          " min";
      }
    };

    render();

    if (remaining <= 0) {
      return;
    }

    announceCooldownTimer =
      setInterval(() => {
        remaining -= 1;
        render();
      }, 1000);
  }

  async function sendAnnounce() {
    const status =
      $("m99-announce-status");

    const button =
      $("m99-announce");

    if (button?.disabled) {
      return;
    }

    if (button) {
      button.disabled = true;
    }

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

      if (
        !data?.ok &&
        Number(data?.retry_after) > 0
      ) {
        startAnnounceCooldown(
          Number(data.retry_after)
        );

        return;
      }

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

      startAnnounceCooldown(
        ANNOUNCE_COOLDOWN_SECONDS
      );

      setTimeout(
        loadIdentity,
        1500
      );

    } catch (error) {
      if (button) {
        button.disabled = false;
      }

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

  // Public hook for the custom mobile navigation.
  // The mobile Status tab does not click the legacy settings tab,
  // so it must be able to load the profile/announce panel directly.
  window.reticulumProfile099 = {
    loadIdentity,
    sendAnnounce
  };

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


/* N2K OS UI Layer 1.24.4-beta1 */
(function(){
  "use strict";

  const VERSION="1.28.3-beta1";

  function addStylesheet(){
    if(document.getElementById("n2k-os-css")) return;
    const link=document.createElement("link");
    link.id="n2k-os-css";
    link.rel="stylesheet";
    link.href="static/n2k-os.css?v="+encodeURIComponent(VERSION);
    document.head.appendChild(link);
  }

  function activateExistingTab(tab){
    const button=document.querySelector('#n2k-mobile-real-nav [data-real-tab="'+tab+'"]');
    if(button) button.click();
  }

  function openNearestDetails(el){
    if(!el) return;
    const details=el.closest("details");
    if(details) details.open=true;
  }

  function scrollToTarget(selector){
    const el=document.querySelector(selector);
    if(!el) return false;
    openNearestDetails(el);
    window.setTimeout(function(){
      el.scrollIntoView({behavior:"smooth",block:"start"});
    },40);
    return true;
  }

  function switchExistingView(name){
    try{
      if(window.matchMedia("(pointer:fine)").matches &&
         typeof window.n2kDesktopView==="function"){
        window.n2kDesktopView(name);
        return true;
      }
      if(typeof window.n2kMobileRealView==="function"){
        window.n2kMobileRealView(name);
        return true;
      }
    }catch(error){
      console.warn("[N2K OS] view switch",error);
    }
    activateExistingTab(name);
    return false;
  }

  function afterView(name,callback){
    switchExistingView(name);
    window.setTimeout(callback,90);
  }

  function navigate(action){
    document.querySelectorAll(".n2k-os-nav-button").forEach(function(btn){
      btn.classList.toggle("is-active",btn.dataset.n2kAction===action);
    });

    if(typeof window.n2kShowPage==="function"){
      window.n2kShowPage(action);
      return;
    }

    switch(action){
      case "overview":
        if(typeof window.n2kOpenOverview==="function"){
          window.n2kOpenOverview();
        }else{
          switchExistingView("chats");
          window.scrollTo({top:0,behavior:"smooth"});
        }
        break;
      case "chat":
        document.body.classList.remove("n2k-overview-active");
        switchExistingView("chats");
        break;
      case "mesh":
        document.body.classList.remove("n2k-overview-active");
        switchExistingView("mesh");
        break;
      case "status":
        document.body.classList.remove("n2k-overview-active");
        switchExistingView("settings");
        break;
      case "contacts":
        document.body.classList.remove("n2k-overview-active");
        switchExistingView("contacts");
        break;
      case "setup":
        document.body.classList.remove("n2k-overview-active");
        afterView("settings",function(){
          scrollToTarget("#rnode-probe-button") ||
          scrollToTarget(".n2k-tech-panel");
        });
        break;
      case "settings":
        document.body.classList.remove("n2k-overview-active");
        afterView("settings",function(){
          scrollToTarget("#n2k-status-overview") ||
          scrollToTarget("#msg-settings-view");
        });
        break;
      case "about":
        document.body.classList.remove("n2k-overview-active");
        afterView("settings",function(){
          scrollToTarget(".n2k-about-card");
        });
        break;
    }
  }

  function createDesktopNav(){
    if(document.getElementById("n2k-os-sidebar")) return;

    const nav=document.createElement("aside");
    nav.id="n2k-os-sidebar";
    nav.className="n2k-os-sidebar";
    nav.setAttribute("aria-label","N2K Navigation");

    nav.innerHTML=
      '<div class="n2k-os-sidebar-brand">'+
        '<div class="n2k-os-sidebar-logo" aria-hidden="true">⌁</div>'+
        '<div><strong>N2K RNS Gateway</strong><small>Reticulum · LXMF NODE</small></div>'+
      '</div>'+
      '<div class="n2k-os-nav-list">'+
        '<button class="n2k-os-nav-button is-active" data-n2k-action="overview"><span class="n2k-os-nav-icon">⌂</span>Übersicht</button>'+
        '<button class="n2k-os-nav-button" data-n2k-action="chat"><span class="n2k-os-nav-icon">✉</span>Chat</button>'+
        '<button class="n2k-os-nav-button" data-n2k-action="contacts"><span class="n2k-os-nav-icon">◎</span>Kontakte</button>'+
        '<button class="n2k-os-nav-button" data-n2k-action="mesh"><span class="n2k-os-nav-icon">⌘</span>Living Mesh</button>'+
        '<button class="n2k-os-nav-button" data-n2k-action="status"><span class="n2k-os-nav-icon">◉</span>Status</button>'+
        '<button class="n2k-os-nav-button" data-n2k-action="settings"><span class="n2k-os-nav-icon">⚙</span>Einstellungen</button>'+
        '<button class="n2k-os-nav-button" data-n2k-action="setup"><span class="n2k-os-nav-icon">⌁</span>Setup</button>'+
        '<button class="n2k-os-nav-button" data-n2k-action="about"><span class="n2k-os-nav-icon">ⓘ</span>Über / Lizenz</button>'+
      '</div>'+
      '<div class="n2k-os-sidebar-foot">NETFREAK2K<br>OFFGRID · MESH · LOCAL INTELLIGENCE<br><span style="color:#20d8ff">KEIN NETZ KEIN PROBLEM</span></div>';

    nav.addEventListener("click",function(event){
      const button=event.target.closest("[data-n2k-action]");
      if(!button) return;
      navigate(button.dataset.n2kAction);
    });

    document.body.prepend(nav);
  }

  function upgradeMobileNav(){
    const nav=document.getElementById("n2k-mobile-real-nav");
    if(!nav || nav.dataset.n2kOsUpgraded==="1") return;
    nav.dataset.n2kOsUpgraded="1";

    const buttons=Array.from(nav.querySelectorAll("button"));
    const chats=buttons.find(function(b){return b.dataset.realTab==="chats";});
    const status=buttons.find(function(b){return b.dataset.realTab==="settings";});
    const mesh=buttons.find(function(b){return b.dataset.realTab==="mesh";});

    if(chats){
      const s=chats.querySelector("small"); if(s) s.textContent="Chat";
      const b=chats.querySelector("b"); if(b) b.textContent="✉";
    }
    if(mesh){
      const s=mesh.querySelector("small"); if(s) s.textContent="Mesh";
      const b=mesh.querySelector("b"); if(b) b.textContent="⌘";
    }
    if(status){
      const s=status.querySelector("small"); if(s) s.textContent="Status";
      const b=status.querySelector("b"); if(b) b.textContent="◉";
    }

    const overview=document.createElement("button");
    overview.type="button";
    overview.innerHTML="<b>⌂</b><small>Übersicht</small>";
    overview.addEventListener("click",function(){
      if(typeof window.n2kOsMobilePage==="function"){
        window.n2kOsMobilePage("overview");
        return;
      }
      buttons.concat([overview,more]).forEach(function(b){b.classList.remove("active");});
      overview.classList.add("active");
      window.scrollTo({top:0,behavior:"smooth"});
    });
    nav.prepend(overview);

    const more=document.createElement("button");
    more.type="button";
    more.innerHTML="<b>•••</b><small>Mehr</small>";
    more.addEventListener("click",function(){
      buttons.concat([overview,more]).forEach(function(b){b.classList.remove("active");});
      more.classList.add("active");
      scrollToTarget(".n2k-about-card") || scrollToTarget(".n2k-tech-panel");
    });
    nav.appendChild(more);
  }

  function updateVersionLabels(){
    const version=document.getElementById("n2k-modern-title-version");
    if(version) version.textContent=VERSION;

    document.querySelectorAll(".n2k-about-row strong").forEach(function(el){
      if(el.textContent.includes("N2K RNS Gateway")) {
        el.textContent="N2K RNS Gateway · "+VERSION;
      }
    });
  }

  function init(){
    const viewport=document.querySelector('meta[name="viewport"]');
    if(viewport){
      const current=viewport.getAttribute("content") || "width=device-width,initial-scale=1";
      if(!/viewport-fit\s*=\s*cover/i.test(current)){
        viewport.setAttribute("content",current+",viewport-fit=cover");
      }
    }

    addStylesheet();
    document.body.classList.add("n2k-os-ready");
    createDesktopNav();
    upgradeMobileNav();
    updateVersionLabels();
    console.info("[N2K OS] UI layer "+VERSION+" ready");
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",init,{once:true});
  }else{
    init();
  }
})();


/* N2K OS Overview Dashboard 1.24.4-beta1 */
(function(){
  "use strict";

  const MAX_EVENTS=5;
  const previous=new Map();
  const events=[];

  function byId(id){return document.getElementById(id);}

  function textOf(id,fallback){
    const el=byId(id);
    const value=(el && el.textContent ? el.textContent : "").trim();
    return value || fallback || "—";
  }

  function statusClass(value){
    const v=String(value||"").toLowerCase();
    if(/online|bereit|up|aktiv|ok|running|verbunden/.test(v)) return "ok";
    if(/offline|down|fehler|error|aus/.test(v)) return "bad";
    return "";
  }

  function addEvent(label,kind){
    if(!label) return;
    events.unshift({
      time:new Date(),
      label:String(label),
      kind:kind||""
    });
    if(events.length>MAX_EVENTS) events.length=MAX_EVENTS;
    renderEvents();
  }

  function watchValue(key,value,label){
    const normalized=String(value||"").trim();
    if(!normalized) return;
    if(!previous.has(key)){
      previous.set(key,normalized);
      return;
    }
    const old=previous.get(key);
    if(old===normalized) return;
    previous.set(key,normalized);
    addEvent(label+": "+normalized,statusClass(normalized));
  }

  function ensureOverview(){
    let overview=byId("n2k-os-overview");
    if(overview) return overview;

    const stage=byId("n2k-mobile-real-content");
    if(!stage) return null;

    overview=document.createElement("section");
    overview.id="n2k-os-overview";
    overview.setAttribute("aria-label","N2K Übersicht");
    overview.innerHTML=
      '<div class="n2k-overview-grid">'+
        '<article class="n2k-overview-card">'+
          '<div class="n2k-overview-card-head"><div class="n2k-overview-card-title"><span class="n2k-overview-icon">⌁</span>RNode</div><i id="n2k-ov-rnode-dot" class="n2k-overview-dot"></i></div>'+
          '<div id="n2k-ov-rnode-main" class="n2k-overview-main">Prüfe…</div>'+
          '<div id="n2k-ov-rnode-sub" class="n2k-overview-sub">Live-Funkhardware</div>'+
        '</article>'+
        '<article class="n2k-overview-card">'+
          '<div class="n2k-overview-card-head"><div class="n2k-overview-card-title"><span class="n2k-overview-icon">◎</span>Reticulum</div><i id="n2k-ov-rns-dot" class="n2k-overview-dot"></i></div>'+
          '<div id="n2k-ov-rns-main" class="n2k-overview-main">Prüfe…</div>'+
          '<div id="n2k-ov-rns-sub" class="n2k-overview-sub">Network Stack</div>'+
        '</article>'+
        '<article class="n2k-overview-card">'+
          '<div class="n2k-overview-card-head"><div class="n2k-overview-card-title"><span class="n2k-overview-icon">✉</span>LXMF</div><i id="n2k-ov-lxmf-dot" class="n2k-overview-dot"></i></div>'+
          '<div id="n2k-ov-lxmf-main" class="n2k-overview-main">Prüfe…</div>'+
          '<div id="n2k-ov-lxmf-sub" class="n2k-overview-sub">Messenger</div>'+
        '</article>'+
        '<article class="n2k-overview-card">'+
          '<div class="n2k-overview-card-head"><div class="n2k-overview-card-title"><span class="n2k-overview-icon">☁</span>Store &amp; Forward</div><i id="n2k-ov-backbone-dot" class="n2k-overview-dot"></i></div>'+
          '<div id="n2k-ov-backbone-main" class="n2k-overview-main">Prüfe…</div>'+
          '<div id="n2k-ov-backbone-sub" class="n2k-overview-sub">Propagation / Sync</div>'+
        '</article>'+
      '</div>'+
      '<div class="n2k-overview-lower">'+
        '<section class="n2k-overview-mesh">'+
          '<div class="n2k-overview-panel-head"><div><strong>Living Mesh</strong><br><small>Echtzeit-Ansicht des N2K Mesh-Netzwerks</small></div><span id="n2k-overview-live-badge" class="n2k-overview-live">LIVE</span></div>'+
          '<div id="n2k-overview-mesh-stage" class="n2k-overview-mesh-stage" role="button" tabindex="0" aria-label="Living Mesh öffnen">'+
            '<svg id="n2k-overview-live-svg" class="n2k-overview-mesh-lines" viewBox="0 0 1100 620" preserveAspectRatio="xMidYMid meet" aria-hidden="true"></svg>'+
            '<div class="n2k-overview-mesh-stats">'+
              '<div class="n2k-overview-mesh-stat"><small>Live</small><strong id="n2k-ov-live">—</strong></div>'+
              '<div class="n2k-overview-mesh-stat"><small>Seen</small><strong id="n2k-ov-seen">—</strong></div>'+
              '<div class="n2k-overview-mesh-stat"><small>Paths</small><strong id="n2k-ov-paths">—</strong></div>'+
              '<div class="n2k-overview-mesh-stat"><small>Relays</small><strong id="n2k-ov-relays">—</strong></div>'+
            '</div>'+
          '</div>'+
        '</section>'+
        '<section class="n2k-overview-activity">'+
          '<div class="n2k-overview-panel-head"><div><strong>Live Aktivitäten</strong><br><small>Änderungen aus laufenden Diensten</small></div></div>'+
          '<div id="n2k-overview-activity-list" class="n2k-overview-activity-list"><div class="n2k-overview-empty">Noch keine Statusänderung seit Öffnen der Übersicht.</div></div>'+
        '</section>'+
      '</div>';

    stage.prepend(overview);

    const mesh=byId("n2k-overview-mesh-stage");
    if(mesh){
      const open=function(){
        document.body.classList.remove("n2k-overview-active");
        if(typeof window.n2kDesktopView==="function" && window.matchMedia("(pointer:fine)").matches){
          window.n2kDesktopView("mesh");
        }else if(typeof window.n2kMobileRealView==="function"){
          window.n2kMobileRealView("mesh");
        }
        document.querySelectorAll(".n2k-os-nav-button").forEach(function(btn){
          btn.classList.toggle("is-active",btn.dataset.n2kAction==="mesh");
        });
      };
      mesh.addEventListener("click",open);
      mesh.addEventListener("keydown",function(e){
        if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}
      });
    }

    return overview;
  }

  function setDot(id,value){
    const dot=byId(id);
    if(!dot) return;
    dot.className="n2k-overview-dot "+statusClass(value);
  }

  function syncOverviewMesh(){
    const source=byId("n2k-constellation-svg");
    const target=byId("n2k-overview-live-svg");
    if(!source||!target) return;
    const viewBox=source.getAttribute("viewBox")||"0 0 1100 620";
    if(target.getAttribute("viewBox")!==viewBox) target.setAttribute("viewBox",viewBox);
    const next=source.innerHTML;
    if(next && target.innerHTML!==next) target.innerHTML=next;
  }

  function update(){
    if(!ensureOverview()) return;
    syncOverviewMesh();

    const rnode=textOf("hero-lora",textOf("n2k-status-rnode","—"));
    const rnodeSub=textOf("rnode-live-rate",textOf("n2k-status-rnode-sub","Live-Funkhardware"));
    const rns=textOf("hero-rns",textOf("n2k-status-rns","—"));
    const rnsSub=textOf("shared-name","Reticulum Network Stack");
    const lxmf=textOf("n2k-status-lxmf",textOf("messenger-status-text","—"));
    const propagation=textOf("n2k-propagation-runtime","—");
    const propagationDetail=textOf("n2k-propagation-last-sync","Propagation / Sync");
    const backbone=/aktiv|active|bereit|ready|requested|sync/i.test(propagation)
      ? propagation
      : textOf("hero-internet",textOf("n2k-status-ifaces","—"));
    const backboneSub=/aktiv|active|bereit|ready|requested|sync/i.test(propagation)
      ? propagationDetail
      : "Store & Forward";

    const map={
      "n2k-ov-rnode-main":rnode,
      "n2k-ov-rnode-sub":rnodeSub,
      "n2k-ov-rns-main":rns,
      "n2k-ov-rns-sub":rnsSub,
      "n2k-ov-lxmf-main":lxmf,
      "n2k-ov-lxmf-sub":"LXMF Messenger",
      "n2k-ov-backbone-main":backbone,
      "n2k-ov-backbone-sub":backboneSub,
      "n2k-ov-live":textOf("n2k-map-live","—"),
      "n2k-ov-seen":textOf("n2k-map-visible","—"),
      "n2k-ov-paths":textOf("n2k-map-paths",textOf("net-paths","—")),
      "n2k-ov-relays":textOf("n2k-map-relays","—")
    };

    Object.keys(map).forEach(function(id){
      const el=byId(id); if(el) el.textContent=map[id];
    });

    setDot("n2k-ov-rnode-dot",rnode);
    setDot("n2k-ov-rns-dot",rns);
    setDot("n2k-ov-lxmf-dot",lxmf);
    setDot("n2k-ov-backbone-dot",backbone);

    watchValue("rnode",rnode,"RNode Status");
    watchValue("rns",rns,"Reticulum Status");
    watchValue("lxmf",lxmf,"LXMF Status");
    watchValue("backbone",backbone,"Backbone Status");

    const pathsValue=map["n2k-ov-paths"];
    const liveValue=map["n2k-ov-live"];

    if(previous.has("paths") && previous.get("paths")!==String(pathsValue||"").trim()){
      previous.set("paths",String(pathsValue||"").trim());
      addEvent("Reticulum kennt jetzt "+pathsValue+" Pfade","ok");
    }else if(!previous.has("paths") && String(pathsValue||"").trim()){
      previous.set("paths",String(pathsValue||"").trim());
    }

    /* Live-node counts fluctuate constantly and were flooding the activity
       feed. Keep the current count on the Mesh card, but do not log every
       2 -> 3 -> 5 -> 6 change as an activity event. */
    if(String(liveValue||"").trim()){
      previous.set("live",String(liveValue||"").trim());
      const badge=byId("n2k-overview-live-badge");
      if(badge){
        const num=String(liveValue||"").trim();
        badge.textContent=(num && num!=="—") ? num+" KNOTEN ONLINE" : "LIVE";
      }
    }
  }

  function renderEvents(){
    const root=byId("n2k-overview-activity-list");
    if(!root) return;
    if(!events.length){
      root.innerHTML='<div class="n2k-overview-empty">Noch keine Statusänderung seit Öffnen der Übersicht.</div>';
      return;
    }

    root.innerHTML="";
    events.forEach(function(event){
      const row=document.createElement("div");
      row.className="n2k-overview-event "+(event.kind||"");
      const hh=String(event.time.getHours()).padStart(2,"0");
      const mm=String(event.time.getMinutes()).padStart(2,"0");
      row.innerHTML="<time>"+hh+":"+mm+"</time><i></i><span></span>";
      row.querySelector("span").textContent=event.label;
      root.appendChild(row);
    });
  }

  function openOverview(){
    ensureOverview();
    document.body.classList.add("n2k-overview-active");
    document.querySelectorAll(".n2k-os-nav-button").forEach(function(btn){
      btn.classList.toggle("is-active",btn.dataset.n2kAction==="overview");
    });
    window.scrollTo({top:0,behavior:"smooth"});
    update();
  }

  function boot(){
    ensureOverview();
    update();
    setInterval(update,1500);
    window.n2kOpenOverview=openOverview;

    /* First page after load is the new overview. */
    setTimeout(openOverview,120);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",boot,{once:true});
  }else{
    boot();
  }
})();


/* N2K OS Mobile Router 1.24.4-beta1 */
(function(){
  "use strict";

  const PAGE_CLASSES=[
    "n2k-os-mobile-page-overview",
    "n2k-os-mobile-page-chat",
    "n2k-os-mobile-page-mesh",
    "n2k-os-mobile-page-status",
    "n2k-os-mobile-page-contacts",
    "n2k-os-mobile-page-more",
    "n2k-os-mobile-chat-open"
  ];

  function isMobile(){
    return window.matchMedia("(max-width:900px)").matches;
  }

  function byId(id){return document.getElementById(id);}

  function stage(){
    return byId("n2k-mobile-real-content");
  }

  function ensureMore(){
    let more=byId("n2k-os-more");
    if(more) return more;
    const root=stage();
    if(!root) return null;

    more=document.createElement("section");
    more.id="n2k-os-more";
    more.setAttribute("aria-label","Mehr");
    more.innerHTML=
      '<div class="n2k-overview-panel-head"><div><strong>Mehr</strong><br><small>Weitere Bereiche des Gateways</small></div></div>'+
      '<div class="n2k-os-more-grid">'+
        '<button class="n2k-os-more-card" type="button" data-n2k-mobile-target="settings"><b>Einstellungen</b><span>Gateway, Identity und Netzwerk konfigurieren</span></button>'+
        '<button class="n2k-os-more-card" type="button" data-n2k-mobile-target="setup"><b>Setup</b><span>RNode und Gateway Schritt für Schritt einrichten</span></button>'+
        '<button class="n2k-os-more-card" type="button" data-n2k-mobile-target="about"><b>Über / Lizenz</b><span>Version, Projekt- und Lizenzinformationen</span></button>'+
      '</div>';

    root.prepend(more);

    more.addEventListener("click",function(event){
      const button=event.target.closest("[data-n2k-mobile-target]");
      if(!button) return;
      const target=button.dataset.n2kMobileTarget;
      if(target==="contacts"){
        showPage("contacts");
      }else if(target==="settings"){
        showPage("status");
        setTimeout(function(){
          document.getElementById("n2k-status-overview")?.scrollIntoView({behavior:"smooth",block:"start"});
        },80);
      }else if(target==="setup"){
        showPage("status");
        setTimeout(function(){
          (document.getElementById("n2k-setup-assistant") ||
           document.getElementById("n2k-hardware-usb-card"))?.scrollIntoView({behavior:"smooth",block:"start"});
        },80);
      }else if(target==="about"){
        showPage("status");
        setTimeout(function(){
          document.querySelector(".n2k-about-card")?.scrollIntoView({behavior:"smooth",block:"start"});
        },80);
      }
    });

    return more;
  }

  function clearPageClasses(){
    PAGE_CLASSES.forEach(function(name){document.body.classList.remove(name);});
    document.body.classList.remove("n2k-overview-active");
  }

  function forceHidden(el,hidden,display){
    if(!el) return;
    el.hidden=!!hidden;
    el.style.setProperty("display",hidden ? "none" : (display || "block"),"important");
  }

  function resetViews(){
    const root=stage();
    if(!root) return;

    forceHidden(byId("n2k-os-overview"),true);
    forceHidden(byId("n2k-os-more"),true);
    forceHidden(root.querySelector(".messenger-search-wrap"),true);
    forceHidden(byId("messenger-chat-list"),true);
    forceHidden(byId("msg-contacts-view"),true);
    forceHidden(byId("msg-settings-view"),true);
    forceHidden(byId("msg-mesh-view"),true);
    forceHidden(root.querySelector(".messenger-conversation"),true);
  }

  function setActive(tab){
    const nav=byId("n2k-mobile-real-nav");
    if(!nav) return;
    nav.querySelectorAll("button").forEach(function(button){
      button.classList.toggle("active",button.dataset.n2kOsTab===tab);
    });
  }

  function showPage(page){
    if(!isMobile()) return false;

    ensureMore();
    resetViews();
    clearPageClasses();

    const root=stage();
    if(!root) return false;

    window.scrollTo({top:0,behavior:"smooth"});

    if(page==="overview"){
      const overview=byId("n2k-os-overview");
      forceHidden(overview,false,"block");
      document.body.classList.add("n2k-os-mobile-page-overview");
      setActive("overview");
      return false;
    }

    if(page==="chat"){
      forceHidden(root.querySelector(".messenger-search-wrap"),false,"block");
      forceHidden(byId("messenger-chat-list"),false,"block");
      document.body.classList.add("n2k-os-mobile-page-chat");
      setActive("chat");
      try{
        const core=window.reticulumMessenger097;
        if(core && typeof core.loadContacts==="function") core.loadContacts();
      }catch(_){}
      return false;
    }

    if(page==="mesh"){
      forceHidden(byId("msg-mesh-view"),false,"block");
      document.body.classList.add("n2k-os-mobile-page-mesh");
      setActive("mesh");
      return false;
    }

    if(page==="status"){
      forceHidden(byId("msg-settings-view"),false,"block");
      document.body.classList.add("n2k-os-mobile-page-status");
      setActive("status");
      try{
        if(window.reticulumProfile099 &&
           typeof window.reticulumProfile099.loadIdentity==="function"){
          window.reticulumProfile099.loadIdentity();
        }
      }catch(_){}
      return false;
    }

    if(page==="contacts"){
      forceHidden(byId("msg-contacts-view"),false,"block");
      document.body.classList.add("n2k-os-mobile-page-contacts");
      setActive("more");
      try{
        const core=window.reticulumMessenger097;
        if(core && typeof core.loadContacts==="function") core.loadContacts();
      }catch(_){}
      return false;
    }

    if(page==="more"){
      forceHidden(byId("n2k-os-more"),false,"block");
      document.body.classList.add("n2k-os-mobile-page-more");
      setActive("more");
      return false;
    }

    return false;
  }

  function rebuildBottomNav(){
    if(!isMobile()) return;
    const nav=byId("n2k-mobile-real-nav");
    if(!nav) return;

    nav.innerHTML=
      '<button type="button" data-n2k-os-tab="overview"><b>⌂</b><small>Übersicht</small></button>'+
      '<button type="button" data-n2k-os-tab="chat"><b>✉</b><small>Chat</small></button>'+
      '<button type="button" data-n2k-os-tab="contacts"><b>◎</b><small>Kontakte</small></button>'+
      '<button type="button" data-n2k-os-tab="status"><b>◉</b><small>Status</small></button>'+
      '<button type="button" data-n2k-os-tab="more"><b>•••</b><small>Mehr</small></button>';

    nav.onclick=function(event){
      const button=event.target.closest("[data-n2k-os-tab]");
      if(!button) return;
      event.preventDefault();
      event.stopPropagation();
      showPage(button.dataset.n2kOsTab);
    };

    nav.addEventListener("click",function(event){
      if(event.target.closest("[data-n2k-os-tab]")){
        event.stopImmediatePropagation();
      }
    },true);
  }

  function wrapConversation(){
    if(!isMobile()) return;

    const oldOpen=window.openMessengerConversation;
    if(typeof oldOpen==="function" && !oldOpen.__n2kOs1231){
      const wrapped=function(peer){
        oldOpen(peer);
        setTimeout(function(){
          resetViews();
          clearPageClasses();
          const conversation=stage()?.querySelector(".messenger-conversation");
          forceHidden(conversation,false,"flex");
          document.body.classList.add("n2k-os-mobile-chat-open");
          setActive("chat");
          window.scrollTo({top:0,behavior:"smooth"});
        },0);
      };
      wrapped.__n2kOs1231=true;
      window.openMessengerConversation=wrapped;
    }

    const back=byId("messenger-back");
    if(back){
      back.onclick=function(event){
        if(event){event.preventDefault();event.stopPropagation();}
        return showPage("chat");
      };
    }
  }

  function boot(){
    if(!isMobile()) return;
    ensureMore();
    rebuildBottomNav();

    /* Older shell scripts re-bind the same controls after load. Re-assert
       the final router after their delayed binds have finished. */
    [0,350,1300,2200].forEach(function(delay){
      setTimeout(function(){
        rebuildBottomNav();
        wrapConversation();
      },delay);
    });

    setTimeout(function(){showPage("overview");},150);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",boot,{once:true});
  }else{
    boot();
  }

  window.n2kOsMobilePage=showPage;
})();


/* N2K Unified App Router 1.24.4-beta1 */
(function(){
  "use strict";

  const PAGE_DEFS={
    overview:{title:"Übersicht",sub:"Live-Status, Living Mesh und aktuelle Aktivitäten"},
    chat:{title:"Chat",sub:"LXMF Nachrichten"},
    contacts:{title:"Kontakte",sub:"Kontaktverwaltung, QR, Import und Export"},
    mesh:{title:"Living Mesh",sub:"Live-Aktivität, Routen und Relays"},
    status:{title:"Status",sub:"Systemzustand, Funkstatus und Diagnose"},
    settings:{title:"Einstellungen",sub:"Identity, Netzwerk und Store & Forward"},
    setup:{title:"Setup",sub:"Gateway und RNode Schritt für Schritt einrichten"},
    about:{title:"Über / Lizenz",sub:"Projekt-, Versions- und Lizenzinformationen"},
    more:{title:"Mehr",sub:"Weitere Bereiche des Gateways"}
  };

  function byId(id){return document.getElementById(id);}
  function root(){return byId("n2k-mobile-real-content");}

  function makePage(name){
    let page=byId("n2k-page-"+name);
    if(page) return page;
    const r=root();
    if(!r) return null;

    page=document.createElement("section");
    page.id="n2k-page-"+name;
    page.className="n2k-app-page";
    page.dataset.n2kPage=name;

    if(name!=="overview"){
      const meta=PAGE_DEFS[name];
      const head=document.createElement("div");
      head.className="n2k-app-page-head";
      head.innerHTML="<div><h2></h2><p></p></div>";
      head.querySelector("h2").textContent=meta.title;
      head.querySelector("p").textContent=meta.sub;
      page.appendChild(head);
    }

    r.prepend(page);
    return page;
  }

  function move(id,pageName){
    const el=typeof id==="string" ? document.querySelector(id) : id;
    const page=makePage(pageName);
    if(el && page && el.parentElement!==page) page.appendChild(el);
  }

  function buildPages(){
    const r=root();
    if(!r) return false;

    Object.keys(PAGE_DEFS).forEach(makePage);

    /* Overview */
    move("#n2k-os-overview","overview");

    /* Chat */
    move(".messenger-search-wrap","chat");
    move("#messenger-chat-list","chat");
    move(".messenger-conversation","chat");

    /* Contacts / Mesh */
    move("#msg-contacts-view","contacts");
    move("#msg-mesh-view","mesh");

    /* Status = only status/health/diagnostics */
    [
      "#n2k-status-overview",
      "#n2k-radio-widget",
      "#n2k-resilience-card",
      "#n2k-selftest-card"
    ].forEach(function(sel){move(sel,"status");});

    /* Settings = actual configuration surfaces */
    [
      "#reticulum-network",
      "#reticulum-identity",
      "#n2k-propagation-card"
    ].forEach(function(sel){move(sel,"settings");});

    /* Setup = onboarding and hardware setup */
    [
      "#n2k-first-run-guide",
      "#n2k-setup-assistant",
      "#n2k-hardware-usb-card",
      "#n2k-help"
    ].forEach(function(sel){move(sel,"setup");});

    move(".n2k-about-card","about");

    const more=makePage("more");
    if(more && !more.querySelector(".n2k-os-more-grid")){
      const grid=document.createElement("div");
      grid.className="n2k-os-more-grid";
      grid.innerHTML=
        '<button class="n2k-os-more-card" type="button" data-page="settings"><b>Einstellungen</b><span>Identity, Netzwerk und Store & Forward</span></button>'+
        '<button class="n2k-os-more-card" type="button" data-page="setup"><b>Setup</b><span>Gateway und RNode einrichten</span></button>'+
        '<button class="n2k-os-more-card" type="button" data-page="about"><b>Über / Lizenz</b><span>Version und Lizenzinformationen</span></button>';
      grid.addEventListener("click",function(e){
        const b=e.target.closest("[data-page]");
        if(b) showPage(b.dataset.page);
      });
      more.appendChild(grid);
    }

    document.body.classList.add("n2k-pages-ready");
    return true;
  }

  function hideAll(){
    document.querySelectorAll(".n2k-app-page").forEach(function(page){
      page.classList.remove("is-active");
      page.hidden=true;
      page.style.setProperty("display","none","important");
    });
  }

  function activateNav(name){
    document.querySelectorAll(".n2k-os-nav-button").forEach(function(btn){
      btn.classList.toggle("is-active",btn.dataset.n2kAction===name);
    });
    document.querySelectorAll("#n2k-mobile-real-nav [data-n2k-os-tab]").forEach(function(btn){
      btn.classList.toggle("active",btn.dataset.n2kOsTab===name);
    });
  }

  function showPage(name){
    if(!buildPages()) return false;
    hideAll();

    const page=byId("n2k-page-"+name);
    if(!page) return false;

    page.hidden=false;
    page.classList.add("is-active");
    page.style.setProperty("display","block","important");
    document.body.classList.remove(
      "n2k-overview-active",
      "n2k-os-mobile-page-overview",
      "n2k-os-mobile-page-chat",
      "n2k-os-mobile-page-mesh",
      "n2k-os-mobile-page-status",
      "n2k-os-mobile-page-contacts",
      "n2k-os-mobile-page-more",
      "n2k-os-mobile-chat-open"
    );

    activateNav(name);
    window.scrollTo({top:0,behavior:"smooth"});

    if(name==="contacts"){
      try{
        const core=window.reticulumMessenger097;
        if(core && typeof core.loadContacts==="function") core.loadContacts();
      }catch(_){}
    }

    if(name==="settings" || name==="status"){
      try{
        if(window.reticulumProfile099 &&
           typeof window.reticulumProfile099.loadIdentity==="function"){
          window.reticulumProfile099.loadIdentity();
        }
      }catch(_){}
    }

    return false;
  }

  function rebuildDesktopNav(){
    const list=document.querySelector(".n2k-os-nav-list");
    if(!list) return;

    list.innerHTML=
      '<button class="n2k-os-nav-button" data-n2k-action="overview"><span class="n2k-os-nav-icon">⌂</span>Übersicht</button>'+
      '<button class="n2k-os-nav-button" data-n2k-action="chat"><span class="n2k-os-nav-icon">✉</span>Chat</button>'+
      '<button class="n2k-os-nav-button" data-n2k-action="contacts"><span class="n2k-os-nav-icon">◎</span>Kontakte</button>'+
      '<button class="n2k-os-nav-button" data-n2k-action="mesh"><span class="n2k-os-nav-icon">⌘</span>Living Mesh</button>'+
      '<button class="n2k-os-nav-button" data-n2k-action="status"><span class="n2k-os-nav-icon">◉</span>Status</button>'+
      '<button class="n2k-os-nav-button" data-n2k-action="settings"><span class="n2k-os-nav-icon">⚙</span>Einstellungen</button>'+
      '<button class="n2k-os-nav-button" data-n2k-action="setup"><span class="n2k-os-nav-icon">⌁</span>Setup</button>'+
      '<button class="n2k-os-nav-button" data-n2k-action="about"><span class="n2k-os-nav-icon">ⓘ</span>Über / Lizenz</button>';

    list.onclick=function(e){
      const btn=e.target.closest("[data-n2k-action]");
      if(!btn) return;
      e.preventDefault();
      e.stopPropagation();
      showPage(btn.dataset.n2kAction);
    };
  }

  function rebuildMobileNav(){
    const nav=byId("n2k-mobile-real-nav");
    if(!nav) return;

    nav.innerHTML=
      '<button type="button" data-n2k-os-tab="overview"><b>⌂</b><small>Übersicht</small></button>'+
      '<button type="button" data-n2k-os-tab="chat"><b>✉</b><small>Chat</small></button>'+
      '<button type="button" data-n2k-os-tab="contacts"><b>◎</b><small>Kontakte</small></button>'+
      '<button type="button" data-n2k-os-tab="status"><b>◉</b><small>Status</small></button>'+
      '<button type="button" data-n2k-os-tab="more"><b>•••</b><small>Mehr</small></button>';

    nav.onclick=function(e){
      const btn=e.target.closest("[data-n2k-os-tab]");
      if(!btn) return;
      e.preventDefault();
      e.stopPropagation();
      showPage(btn.dataset.n2kOsTab);
    };
  }

  function wrapChatOpen(){
    const old=window.openMessengerConversation;
    if(typeof old==="function" && !old.__n2kUnified1240){
      const wrapped=function(peer){
        showPage("chat");
        old(peer);
        setTimeout(function(){
          const page=byId("n2k-page-chat");
          const conv=page?.querySelector(".messenger-conversation");
          const search=page?.querySelector(".messenger-search-wrap");
          const list=page?.querySelector("#messenger-chat-list");
          if(search) search.style.setProperty("display","none","important");
          if(list) list.style.setProperty("display","none","important");
          if(conv){
            conv.hidden=false;
            conv.style.setProperty("display","flex","important");
          }
        },0);
      };
      wrapped.__n2kUnified1240=true;
      window.openMessengerConversation=wrapped;
    }

    const back=byId("messenger-back");
    if(back){
      back.onclick=function(e){
        if(e){e.preventDefault();e.stopPropagation();}
        showPage("chat");
        const page=byId("n2k-page-chat");
        const conv=page?.querySelector(".messenger-conversation");
        const search=page?.querySelector(".messenger-search-wrap");
        const list=page?.querySelector("#messenger-chat-list");
        if(conv) conv.style.setProperty("display","none","important");
        if(search) search.style.setProperty("display","block","important");
        if(list) list.style.setProperty("display","block","important");
        return false;
      };
    }
  }

  function boot(){
    if(!buildPages()) return;

    rebuildDesktopNav();
    rebuildMobileNav();
    wrapChatOpen();

    /* Old scripts run delayed. Re-assemble after all known legacy binds. */
    [250,900,1800,3000].forEach(function(delay){
      setTimeout(function(){
        buildPages();
        rebuildDesktopNav();
        rebuildMobileNav();
        wrapChatOpen();
        const active=document.querySelector(".n2k-app-page.is-active");
        if(!active) showPage("overview");
      },delay);
    });

    showPage("overview");
    window.n2kShowPage=showPage;
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",boot,{once:true});
  }else{
    boot();
  }
})();


/* N2K Final UX Fixes 1.24.4-beta1 */
(function(){
  "use strict";

  const LICENSE_TEXT="MIT License\n\nCopyright (c) 2026 Netfreak2k\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof the original N2K RNS Gateway software and associated documentation files\n(the \"Software\"), to deal in the Software without restriction, including\nwithout limitation the rights to use, copy, modify, merge, publish,\ndistribute, sublicense, and/or sell copies of the Software, and to permit\npersons to whom the Software is furnished to do so, subject to the following\nconditions:\n\nThe above copyright notice and this permission notice shall be included in\nall copies or substantial portions of the Software.\n\nThis license applies only to original N2K RNS Gateway code authored by\nNetfreak2k. Third-party components remain subject to their respective\nlicenses.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\nTHE SOFTWARE.";
  const THIRD_PARTY_TEXT="N2K RNS Gateway includes or depends on third-party software.\n\nReticulum / rns==1.5.4\nLicense: Reticulum License\nCopyright (c) 2016-2026 Mark Qvist\n\nLXMF / lxmf==1.1.1\nLicense: Reticulum License\nCopyright (c) 2020-2025 Mark Qvist\n\nPython qrcode / qrcode==7.4.2\nLicense: BSD 3-Clause-style license\n\nHome Assistant\nLicense: Apache License 2.0\nN2K RNS Gateway is not an official Home Assistant add-on.\n\nWhen redistributing N2K RNS Gateway, retain the project LICENSE,\nTHIRD_PARTY_NOTICES.md and all license/copyright notices required by\nbundled or installed third-party components.";

  function byId(id){return document.getElementById(id);}

  function ensureLicensePanel(){
    const page=byId("n2k-page-about");
    if(!page || page.querySelector(".n2k-license-panel")) return;

    const panel=document.createElement("section");
    panel.className="n2k-license-panel";

    const own=document.createElement("details");
    const ownSummary=document.createElement("summary");
    ownSummary.textContent="N2K RNS Gateway · MIT-Lizenz anzeigen";
    const ownContent=document.createElement("div");
    ownContent.className="n2k-license-content";
    const ownIntro=document.createElement("p");
    ownIntro.textContent="Diese Lizenz gilt für den originalen N2K-RNS-Gateway-Code von Netfreak2k.";
    const ownPre=document.createElement("pre");
    ownPre.textContent=LICENSE_TEXT;
    ownContent.append(ownIntro,ownPre);
    own.append(ownSummary,ownContent);

    const third=document.createElement("details");
    const thirdSummary=document.createElement("summary");
    thirdSummary.textContent="Drittanbieter-Lizenzen & Hinweise anzeigen";
    const thirdContent=document.createElement("div");
    thirdContent.className="n2k-license-content";
    const thirdPre=document.createElement("pre");
    thirdPre.textContent=THIRD_PARTY_TEXT;

    const links=document.createElement("div");
    links.className="n2k-license-links";

    [
      ["Reticulum Lizenz","https://github.com/markqvist/Reticulum/blob/master/LICENSE"],
      ["LXMF Lizenz","https://github.com/markqvist/LXMF/blob/master/LICENSE"],
      ["Python qrcode Lizenz","https://github.com/lincolnloop/python-qrcode/blob/main/LICENSE"],
      ["Home Assistant Lizenz","https://github.com/home-assistant/core/blob/dev/LICENSE.md"]
    ].forEach(function(item){
      const a=document.createElement("a");
      a.href=item[1];
      a.target="_blank";
      a.rel="noopener noreferrer";
      a.textContent=item[0];
      links.appendChild(a);
    });

    thirdContent.append(thirdPre,links);
    third.append(thirdSummary,thirdContent);

    panel.append(own,third);
    page.appendChild(panel);
  }

  function replaceMobileNav(){
    const old=byId("n2k-mobile-real-nav");
    if(!old || window.innerWidth>900) return;

    const nav=old.cloneNode(false);
    nav.id="n2k-mobile-real-nav";
    nav.className="n2k-mobile-real-nav n2k-final-mobile-nav";
    nav.setAttribute("aria-label","App Navigation");

    nav.innerHTML=
      '<button type="button" data-n2k-os-tab="overview"><b>⌂</b><small>Übersicht</small></button>'+
      '<button type="button" data-n2k-os-tab="chat"><b>✉</b><small>Chat</small></button>'+
      '<button type="button" data-n2k-os-tab="contacts"><b>◎</b><small>Kontakte</small></button>'+
      '<button type="button" data-n2k-os-tab="status"><b>◉</b><small>Status</small></button>'+
      '<button type="button" data-n2k-os-tab="more"><b>•••</b><small>Mehr</small></button>';

    old.replaceWith(nav);

    nav.addEventListener("click",function(event){
      const button=event.target.closest("[data-n2k-os-tab]");
      if(!button) return;
      event.preventDefault();
      event.stopPropagation();
      if(typeof window.n2kShowPage==="function"){
        window.n2kShowPage(button.dataset.n2kOsTab);
      }
    });

    nav.addEventListener("touchend",function(event){
      const button=event.target.closest("[data-n2k-os-tab]");
      if(!button) return;
      event.preventDefault();
      if(typeof window.n2kShowPage==="function"){
        window.n2kShowPage(button.dataset.n2kOsTab);
      }
    },{passive:false});
  }

  function hardenOverview(){
    const original=window.n2kShowPage;
    if(typeof original!=="function" || original.__n2k1241) return;

    const wrapped=function(name){
      const result=original(name);

      if(name==="overview"){
        const page=byId("n2k-page-overview");
        const overview=byId("n2k-os-overview");

        document.querySelectorAll(".n2k-app-page").forEach(function(p){
          const active=p===page;
          p.hidden=!active;
          p.classList.toggle("is-active",active);
          p.style.setProperty("display",active?"block":"none","important");
        });

        if(overview){
          overview.hidden=false;
          overview.style.setProperty("display","block","important");
          overview.style.setProperty("visibility","visible","important");
          overview.style.setProperty("opacity","1","important");
        }
      }

      if(name==="about"){
        setTimeout(ensureLicensePanel,0);
      }

      return result;
    };

    wrapped.__n2k1241=true;
    window.n2kShowPage=wrapped;
  }

  function boot(){
    hardenOverview();
    ensureLicensePanel();

    /* Old delayed scripts have already attached listeners by now;
       replacing the node removes every stale listener in one operation. */
    [50,500,1600,3400].forEach(function(delay){
      setTimeout(function(){
        hardenOverview();
        replaceMobileNav();
        ensureLicensePanel();
      },delay);
    });
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",boot,{once:true});
  }else{
    boot();
  }
})();


/* N2K Chat + Mesh Route Fix 1.24.4-beta1 */
(function(){
  "use strict";

  function byId(id){return document.getElementById(id);}

  function force(el,show,display){
    if(!el) return;
    el.hidden=!show;
    el.style.setProperty("display",show?(display||"block"):"none","important");
    if(show){
      el.style.setProperty("visibility","visible","important");
      el.style.setProperty("opacity","1","important");
    }
  }

  function fixChatPage(){
    const page=byId("n2k-page-chat");
    if(!page) return;
    const search=page.querySelector(".messenger-search-wrap");
    const list=page.querySelector("#messenger-chat-list");
    const conv=page.querySelector(".messenger-conversation");

    force(search,true,"block");
    force(list,true,"block");
    force(conv,false,"flex");

    try{
      const core=window.reticulumMessenger097;
      if(core && typeof core.loadChats==="function") core.loadChats();
      if(core && typeof core.loadContacts==="function") core.loadContacts();
    }catch(_){}
  }

  function fixMeshPage(){
    const page=byId("n2k-page-mesh");
    const mesh=byId("msg-mesh-view");
    const card=byId("n2k-constellation-card");
    const svg=byId("n2k-constellation-svg");

    if(page){
      page.hidden=false;
      page.classList.add("is-active");
      page.style.setProperty("display","block","important");
    }
    force(mesh,true,"block");
    force(card,true,"block");
    if(svg){
      svg.style.setProperty("display","block","important");
      svg.style.setProperty("visibility","visible","important");
      svg.style.setProperty("opacity","1","important");
    }

    /* Existing Living Mesh loader already runs every 5 seconds.
       A resize event forces its current responsive layout to recalculate. */
    requestAnimationFrame(function(){
      window.dispatchEvent(new Event("resize"));
    });
  }

  function wrapShowPage(){
    const original=window.n2kShowPage;
    if(typeof original!=="function" || original.__n2k1242) return;

    const wrapped=function(name){
      const result=original(name);

      if(name==="chat"){
        setTimeout(fixChatPage,0);
        setTimeout(fixChatPage,120);
      }

      if(name==="mesh"){
        setTimeout(fixMeshPage,0);
        setTimeout(fixMeshPage,120);
      }

      return result;
    };

    wrapped.__n2k1242=true;
    window.n2kShowPage=wrapped;
  }

  function installDirectNavCapture(){
    if(document.documentElement.dataset.n2kMeshCapture1242==="1") return;
    document.documentElement.dataset.n2kMeshCapture1242="1";

    document.addEventListener("click",function(event){
      const button=event.target.closest(".n2k-os-nav-button[data-n2k-action='mesh']");
      if(!button) return;
      event.preventDefault();
      event.stopPropagation();
      if(typeof window.n2kShowPage==="function"){
        window.n2kShowPage("mesh");
      }
    },true);
  }

  function boot(){
    wrapShowPage();
    installDirectNavCapture();

    [200,900,1900,3600].forEach(function(delay){
      setTimeout(function(){
        wrapShowPage();
        installDirectNavCapture();
      },delay);
    });
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",boot,{once:true});
  }else{
    boot();
  }
})();


/* N2K Chat + Contacts Refresh 1.24.4-beta1 */
(function(){
  "use strict";

  function byId(id){return document.getElementById(id);}

  function refreshChat(){
    const page=byId("n2k-page-chat");
    if(!page || !page.classList.contains("is-active")) return;

    const search=page.querySelector(".messenger-search-wrap");
    const list=byId("messenger-chat-list");
    const conv=page.querySelector(".messenger-conversation");

    if(search){
      search.hidden=false;
      search.style.setProperty("display","block","important");
      search.style.setProperty("visibility","visible","important");
    }

    if(list){
      list.hidden=false;
      list.style.setProperty("display","block","important");
      list.style.setProperty("visibility","visible","important");
    }

    if(conv){
      conv.hidden=true;
      conv.style.setProperty("display","none","important");
    }

    try{
      if(window.reticulumMessengerChats097 &&
         typeof window.reticulumMessengerChats097.refresh==="function"){
        window.reticulumMessengerChats097.refresh();
      }
    }catch(error){
      console.warn("[N2K] chat refresh",error);
    }
  }

  function refreshContacts(){
    const page=byId("n2k-page-contacts");
    if(!page || !page.classList.contains("is-active")) return;

    const view=byId("msg-contacts-view");
    const head=page.querySelector(".m110-contact-head");
    const tools=page.querySelector(".m110-contact-tools");
    const list=byId("msg-contact-list");

    [view,head,tools,list].forEach(function(el){
      if(!el) return;
      el.hidden=false;
      el.style.setProperty("visibility","visible","important");
      el.style.setProperty("opacity","1","important");
    });

    if(view) view.style.setProperty("display","block","important");
    if(head) head.style.setProperty("display","flex","important");
    if(tools) tools.style.setProperty("display","flex","important");
    if(list) list.style.setProperty("display","block","important");

    try{
      const core=window.reticulumMessenger097;
      if(core && typeof core.loadContacts==="function"){
        core.loadContacts();
      }
    }catch(error){
      console.warn("[N2K] contacts refresh",error);
    }
  }

  function wrap(){
    const original=window.n2kShowPage;
    if(typeof original!=="function" || original.__n2k1243) return;

    const wrapped=function(name){
      const result=original(name);

      if(name==="chat"){
        setTimeout(refreshChat,0);
        setTimeout(refreshChat,180);
      }

      if(name==="contacts"){
        setTimeout(refreshContacts,0);
        setTimeout(refreshContacts,180);
      }

      return result;
    };

    wrapped.__n2k1243=true;
    window.n2kShowPage=wrapped;
  }

  function boot(){
    wrap();
    [250,1000,2200,3800].forEach(function(delay){
      setTimeout(wrap,delay);
    });
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",boot,{once:true});
  }else{
    boot();
  }
})();


/* N2K Page Reparent Guard 1.24.4-beta1 */
(function(){
  "use strict";

  function byId(id){return document.getElementById(id);}

  function put(el,page){
    if(el && page && el.parentElement!==page){
      page.appendChild(el);
    }
  }

  function repairChat(){
    const page=byId("n2k-page-chat");
    if(!page || !page.classList.contains("is-active")) return;

    const search=document.querySelector(".messenger-search-wrap");
    const list=byId("messenger-chat-list");
    const conv=document.querySelector(".messenger-conversation");

    put(search,page);
    put(list,page);
    put(conv,page);

    if(search){
      search.hidden=false;
      search.style.setProperty("display","block","important");
      search.style.setProperty("visibility","visible","important");
      search.style.setProperty("opacity","1","important");
    }

    if(list){
      list.hidden=false;
      list.style.setProperty("display","block","important");
      list.style.setProperty("visibility","visible","important");
      list.style.setProperty("opacity","1","important");
      list.style.setProperty("min-height","120px","important");
    }

    if(conv && !conv.classList.contains("n2k-desktop-chat-open") &&
       !conv.classList.contains("n2k-real-chat-open")){
      conv.hidden=true;
      conv.style.setProperty("display","none","important");
    }

    try{
      if(window.reticulumMessengerChats097 &&
         typeof window.reticulumMessengerChats097.refresh==="function"){
        window.reticulumMessengerChats097.refresh();
      }
    }catch(_){}
  }

  function repairContacts(){
    const page=byId("n2k-page-contacts");
    if(!page || !page.classList.contains("is-active")) return;

    const view=byId("msg-contacts-view");
    put(view,page);

    if(view){
      view.hidden=false;
      view.style.setProperty("display","block","important");
      view.style.setProperty("visibility","visible","important");
      view.style.setProperty("opacity","1","important");
      view.style.setProperty("height","auto","important");
      view.style.setProperty("max-height","none","important");
      view.style.setProperty("overflow","visible","important");
    }

    const head=view?.querySelector(".m110-contact-head");
    const tools=view?.querySelector(".m110-contact-tools");
    const list=byId("msg-contact-list");

    if(head){
      head.hidden=false;
      head.style.setProperty("display","flex","important");
      head.style.setProperty("visibility","visible","important");
      head.style.setProperty("opacity","1","important");
    }

    if(tools){
      tools.hidden=false;
      tools.style.setProperty("display","flex","important");
      tools.style.setProperty("visibility","visible","important");
      tools.style.setProperty("opacity","1","important");
    }

    if(list){
      list.hidden=false;
      list.style.setProperty("display","block","important");
      list.style.setProperty("visibility","visible","important");
      list.style.setProperty("opacity","1","important");
      list.style.setProperty("min-height","120px","important");
    }

    try{
      const core=window.reticulumMessenger097;
      if(core && typeof core.loadContacts==="function"){
        core.loadContacts();
      }
    }catch(_){}
  }

  function repairActive(){
    repairChat();
    repairContacts();
  }

  function wrapShowPage(){
    const original=window.n2kShowPage;
    if(typeof original!=="function" || original.__n2k1244) return;

    const wrapped=function(name){
      const result=original(name);

      if(name==="chat" || name==="contacts"){
        [0,80,250,650,1400].forEach(function(delay){
          setTimeout(repairActive,delay);
        });
      }

      return result;
    };

    wrapped.__n2k1244=true;
    window.n2kShowPage=wrapped;
  }

  function installObserver(){
    if(document.documentElement.dataset.n2kReparent1244==="1") return;
    document.documentElement.dataset.n2kReparent1244="1";

    const root=byId("n2k-mobile-real-content");
    if(!root) return;

    const observer=new MutationObserver(function(){
      repairActive();
    });

    observer.observe(root,{
      childList:true,
      subtree:false
    });

    window.setInterval(repairActive,1200);
  }

  function boot(){
    wrapShowPage();
    installObserver();
    repairActive();

    [300,1200,2600,4200].forEach(function(delay){
      setTimeout(function(){
        wrapShowPage();
        repairActive();
      },delay);
    });
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",boot,{once:true});
  }else{
    boot();
  }
})();


/* N2K OS Showcase Dashboard 1.28.0-beta1 */
(function(){
  "use strict";

  function byId(id){return document.getElementById(id);}
  function upper(v){return String(v||"").trim().toUpperCase();}

  function ensureShowcase(){
    const overview=byId("n2k-os-overview");
    if(!overview || byId("n2k-showcase-footer")) return;

    const footer=document.createElement("div");
    footer.id="n2k-showcase-footer";
    footer.className="n2k-showcase-footer";
    footer.innerHTML=
      '<section class="n2k-showcase-system">'+
        '<div class="n2k-showcase-head">'+
          '<div><span class="n2k-showcase-head-icon">▣</span><strong>Systemstatus</strong></div>'+
          '<button type="button" id="n2k-showcase-run-check">Systemcheck</button>'+
        '</div>'+
        '<div class="n2k-showcase-progress"><i id="n2k-showcase-progress-bar"></i><span id="n2k-showcase-progress-text">System wird geprüft…</span></div>'+
        '<div id="n2k-showcase-checks" class="n2k-showcase-checks"></div>'+
      '</section>'+
      '<section class="n2k-showcase-quick">'+
        '<div class="n2k-showcase-head"><div><span class="n2k-showcase-head-icon">⌁</span><strong>Schnellzugriff</strong></div></div>'+
        '<div class="n2k-showcase-quick-grid">'+
          '<button type="button" data-n2k-quick="chat"><b>✉</b><span>Neue Nachricht</span></button>'+
          '<button type="button" data-n2k-quick="contacts"><b>◎</b><span>Kontakte</span></button>'+
          '<button type="button" data-n2k-quick="mesh"><b>⌘</b><span>Living Mesh</span></button>'+
          '<button type="button" data-n2k-quick="status"><b>◉</b><span>Systemcheck</span></button>'+
        '</div>'+
      '</section>';

    overview.appendChild(footer);

    footer.querySelectorAll("[data-n2k-quick]").forEach(function(btn){
      btn.addEventListener("click",function(){
        const target=btn.dataset.n2kQuick;
        if(typeof window.n2kShowPage==="function"){
          window.n2kShowPage(target);
        }
        if(target==="status"){
          setTimeout(function(){
            byId("n2k-selftest-button")?.click();
          },260);
        }
      });
    });

    byId("n2k-showcase-run-check")?.addEventListener("click",function(){
      if(typeof window.n2kShowPage==="function"){
        window.n2kShowPage("status");
      }
      setTimeout(function(){
        byId("n2k-selftest-button")?.click();
      },260);
    });
  }

  function collectChecks(){
    const rows=Array.from(document.querySelectorAll("#n2k-selftest-results .n2k-selftest-row"));
    const all=rows.map(function(row){
      const label=String(row.querySelector("strong")?.textContent||"").trim();
      const state=upper(row.querySelector(".n2k-selftest-state")?.textContent||"");
      return {
        label:label,
        state:state,
        ok:state==="PASS" || state==="OPTIONAL",
        warn:state==="WARN"
      };
    }).filter(function(item){return item.label;});

    function pick(name,patterns){
      const found=all.find(function(item){
        return patterns.some(function(pattern){return pattern.test(item.label);});
      });
      if(found) return {label:name,state:found.state,ok:found.ok,warn:found.warn};
      return null;
    }

    return [
      pick("RNode",[/RNode/i]),
      pick("Reticulum",[/Reticulum Stack/i,/Reticulum/i]),
      pick("LXMF",[/Messenger Feature Bundle/i,/LXMF Inbox/i,/LXMF/i]),
      pick("Store & Forward",[/Store & Forward/i,/Propagation/i])
    ].filter(Boolean);
  }

  function fallbackChecks(){
    function state(label,id){
      const v=upper(byId(id)?.textContent||"");
      const ok=/UP|ONLINE|BEREIT|AKTIV|READY|PASS|CONNECTED/.test(v) &&
               !/NICHT|FEHLER|FAIL|DOWN|OFFLINE|AUS/.test(v);
      return {label:label,state:ok?"PASS":"—",ok:ok,warn:!ok};
    }
    return [
      state("RNode","n2k-status-rnode"),
      state("Reticulum","n2k-status-rns"),
      state("LXMF","n2k-status-lxmf"),
      state("Store & Forward","n2k-propagation-runtime")
    ];
  }

  function updateShowcase(){
    ensureShowcase();
    const root=byId("n2k-showcase-checks");
    const bar=byId("n2k-showcase-progress-bar");
    const text=byId("n2k-showcase-progress-text");
    if(!root || !bar || !text) return;

    let checks=collectChecks();
    const hasSelftest=checks.length>0;
    if(!hasSelftest) checks=fallbackChecks();

    const good=checks.filter(function(c){return c.ok;}).length;
    const total=checks.length || 1;
    const percent=Math.round((good/total)*100);

    bar.style.width=percent+"%";

    const summary=upper(byId("n2k-selftest-summary")?.textContent||"");
    if(/PASS/.test(summary)){
      text.textContent="ALLE SYSTEME BEREIT";
      bar.classList.add("is-ok");
    }else if(/FAIL/.test(summary)){
      text.textContent="SYSTEMCHECK HAT HINWEISE";
      bar.classList.remove("is-ok");
    }else{
      text.textContent=good+" / "+total+" Bereiche bereit";
      bar.classList.toggle("is-ok",good===total);
    }

    root.innerHTML="";
    checks.slice(0,4).forEach(function(check){
      const item=document.createElement("div");
      item.className="n2k-showcase-check "+(check.ok?"is-ok":check.warn?"is-warn":"");
      const short=check.label
        .replace("Persistente ","")
        .replace("Messenger Feature Bundle","Messenger")
        .replace("LXMF Store & Forward","Store & Forward")
        .replace("RNode / Serial","RNode")
        .replace("Reticulum Stack","Reticulum")
        .replace("Kontaktspeicher","Kontakte")
        .replace("LXMF ","");
      item.innerHTML="<span></span><b></b><small></small>";
      item.querySelector("b").textContent=short;
      item.querySelector("small").textContent=check.ok?"PASS":check.warn?"WARN":check.state||"—";
      root.appendChild(item);
    });
  }

  function boot(){
    ensureShowcase();
    updateShowcase();
    setInterval(updateShowcase,2500);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",boot,{once:true});
  }else{
    boot();
  }
})();
