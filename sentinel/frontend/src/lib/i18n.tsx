"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Locale = "en" | "de";

const STORAGE_KEY = "defentrax-lang";

const TEXT: Record<string, { en: string; de: string }> = {
  "lang.label": { en: "Language", de: "Sprache" },
  "nav.dashboard": { en: "Dashboard", de: "Übersicht" },
  "nav.alerts": { en: "Alerts", de: "Alarme" },
  "nav.events": { en: "Events", de: "Ereignisse" },
  "nav.servers": { en: "Servers", de: "Server" },
  "nav.rules": { en: "Rules", de: "Regeln" },
  "nav.notifications": { en: "Notifications", de: "Versand" },
  "nav.team": { en: "Team", de: "Personen" },
  "nav.roles": { en: "Access", de: "Zugriff" },
  "nav.audit": { en: "Audit logs", de: "Audit" },
  "nav.links": { en: "Links", de: "Links" },
  "nav.menu": { en: "Menu", de: "Menü" },
  "nav.online": { en: "Online", de: "Online" },
  "header.search": { en: "Search events, hosts, IPs", de: "Ereignisse, Hosts, IPs suchen" },
  "header.searchShort": { en: "Search events...", de: "Ereignisse suchen..." },
  "header.welcome": { en: "Welcome", de: "Willkommen" },
  "header.logout": { en: "Logout", de: "Abmelden" },
  "header.alerts": { en: "Alerts", de: "Alarme" },
  "header.light": { en: "Switch to light mode", de: "Helles Design" },
  "header.dark": { en: "Switch to dark mode", de: "Dunkles Design" },
  "header.menu": { en: "Toggle menu", de: "Menü umschalten" },
  "dash.title": { en: "Dashboard", de: "Übersicht" },
  "dash.subtitle": { en: "Open alerts, the last 24 hours of events, and how many servers are reporting.", de: "Offene Alarme, die Ereignisse der letzten 24 Stunden und welche Server sich melden." },
  "dash.queue": { en: "View alerts", de: "Alarme ansehen" },
  "dash.eventsTitle": { en: "Events by severity", de: "Ereignisse nach Schwere" },
  "dash.last24": { en: "Last 24 hours", de: "Letzte 24 Stunden" },
  "dash.coverageTitle": { en: "Agent coverage", de: "Agenten-Abdeckung" },
  "dash.recent": { en: "Recent open alerts", de: "Letzte offene Alarme" },
  "dash.viewAll": { en: "View all", de: "Alle anzeigen" },
  "dash.colAlert": { en: "Alert", de: "Alarm" },
  "dash.loadingAlerts": { en: "Loading open alerts...", de: "Offene Alarme werden geladen..." },
  "dash.openTotal": { en: "Open", de: "Offen" },
  "dash.activeAgents": { en: "active agents", de: "aktive Agenten" },
  "dash.activeAgent": { en: "active agent", de: "aktiver Agent" },
  "dash.serverMany": { en: "servers", de: "Server" },
  "dash.serverOne": { en: "server", de: "Server" },
  "dash.sev.critical": { en: "Critical", de: "Kritisch" },
  "dash.sev.high": { en: "High", de: "Hoch" },
  "dash.sev.medium": { en: "Medium", de: "Mittel" },
  "dash.sev.low": { en: "Low", de: "Niedrig" },
  "dash.sev.info": { en: "Info", de: "Info" },
  "dash.open": { en: "Open alerts", de: "Offene Alarme" },
  "dash.events": { en: "Events, 24h", de: "Ereignisse, 24h" },
  "dash.servers": { en: "Servers", de: "Server" },
  "dash.coverage": { en: "Coverage", de: "Abdeckung" },
  "dash.silent": { en: "Silent hosts", de: "Stille Hosts" },
  "dash.silentHint": { en: "No heartbeat and no event", de: "Kein Heartbeat und kein Ereignis" },
  "dash.noneCritical": { en: "None critical", de: "Keins kritisch" },
  "dash.critical": { en: "critical", de: "kritisch" },
  "dash.received": { en: "Received by the API", de: "Von der API empfangen" },
  "dash.agents": { en: "agents active", de: "Agenten aktiv" },
  "dash.coverageHint": { en: "Agents reporting against enrolled servers", de: "Agenten gegen eingeschriebene Server" },
  "dash.bySeverity": { en: "Open alerts by severity", de: "Offene Alarme nach Schwere" },
  "dash.attention": { en: "Needs attention", de: "Braucht Aufmerksamkeit" },
  "dash.clear": { en: "Queue is clear", de: "Warteschlange ist leer" },
  "dash.clearHint": { en: "No open alerts right now.", de: "Gerade keine offenen Alarme." },
  "dash.selected": { en: "Selected alert", de: "Gewählter Alarm" },
  "dash.pick": { en: "Pick an alert from the queue.", de: "Wähle einen Alarm aus der Liste." },
  "dash.openRecord": { en: "Open record", de: "Datensatz öffnen" },
  "dash.loading": { en: "Loading overview...", de: "Übersicht wird geladen..." },
  "common.hits": { en: "Hits", de: "Treffer" },
  "common.rule": { en: "Rule", de: "Regel" },
  "common.server": { en: "Server", de: "Server" },
  "common.lastSeen": { en: "Last seen", de: "Zuletzt gesehen" },
  "common.firstSeen": { en: "First seen", de: "Zuerst gesehen" },
  "common.sourceIp": { en: "Source IP", de: "Quell-IP" },
  "common.source": { en: "Source", de: "Quelle" },
  "common.category": { en: "Category", de: "Kategorie" },
  "common.host": { en: "Host", de: "Host" },
  "common.received": { en: "Received", de: "Empfangen" },
  "common.occurred": { en: "Occurred", de: "Aufgetreten" },
  "common.save": { en: "Save", de: "Speichern" },
  "common.cancel": { en: "Cancel", de: "Abbrechen" },
  "common.delete": { en: "Delete", de: "Löschen" },
  "common.reset": { en: "Reset", de: "Zurücksetzen" },
  "common.search": { en: "Search", de: "Suchen" },
  "common.previous": { en: "Previous", de: "Zurück" },
  "common.next": { en: "Next", de: "Weiter" },
  "common.close": { en: "Close", de: "Schließen" },
  "common.name": { en: "Name", de: "Name" },
  "common.noDescription": { en: "No description.", de: "Keine Beschreibung." },
  "alerts.title": { en: "Alerts", de: "Alarme" },
  "alerts.subtitle": { en: "Work one detection at a time. Filters stay on the API, the search narrows this page.", de: "Ein Fund nach dem anderen. Filter gehen an die API, die Suche gilt nur für diese Seite." },
  "alerts.active": { en: "active", de: "aktiv" },
  "alerts.loaded": { en: "loaded", de: "geladen" },
  "alerts.search": { en: "Title, rule, server, or source IP", de: "Titel, Regel, Server oder Quell-IP" },
  "alerts.status": { en: "Status", de: "Status" },
  "alerts.severity": { en: "Severity", de: "Schwere" },
  "alerts.allServers": { en: "All servers", de: "Alle Server" },
  "alerts.loading": { en: "Loading alerts…", de: "Alarme werden geladen…" },
  "alerts.empty": { en: "No alerts yet", de: "Noch keine Alarme" },
  "alerts.filtered": { en: "Nothing in this view", de: "Nichts in dieser Sicht" },
  "alerts.filteredHint": { en: "Clear the search or widen the status and severity.", de: "Suche leeren oder Status und Schwere weiter fassen." },
  "alerts.review": { en: "Review the host, then acknowledge while you look and resolve when it is closed.", de: "Host prüfen, währenddessen bestätigen und schließen, wenn es erledigt ist." },
  "alerts.copy": { en: "Copy JSON", de: "JSON kopieren" },
  "alerts.copied": { en: "Copied", de: "Kopiert" },
  "alerts.full": { en: "Full record", de: "Vollständiger Datensatz" },
  "alerts.views": { en: "Saved views", de: "Gespeicherte Sichten" },
  "events.title": { en: "Events", de: "Ereignisse" },
  "events.subtitle": { en: "Search the telemetry the agents already sent.", de: "Telemetry durchsuchen, die die Agenten schon geschickt haben." },
  "events.message": { en: "Message", de: "Meldung" },
  "events.source": { en: "Source", de: "Quelle" },
  "events.allSeverities": { en: "All severities", de: "Jede Schwere" },
  "events.within": { en: "Any time", de: "Gesamter Zeitraum" },
  "events.within15": { en: "Last 15 minutes", de: "Letzte 15 Minuten" },
  "events.within1h": { en: "Last hour", de: "Letzte Stunde" },
  "events.within24": { en: "Last 24 hours", de: "Letzte 24 Stunden" },
  "events.within7": { en: "Last 7 days", de: "Letzte 7 Tage" },
  "events.loading": { en: "Loading events…", de: "Ereignisse werden geladen…" },
  "events.empty": { en: "No events", de: "Keine Ereignisse" },
  "events.emptyHint": { en: "Nothing matches this search.", de: "Nichts passt zu dieser Suche." },
  "events.rows": { en: "rows", de: "Zeilen" },
  "views.save": { en: "Save current", de: "Aktuelle Sicht speichern" },
  "views.name": { en: "View name", de: "Name der Sicht" },
  "views.default": { en: "Open this first", de: "Zuerst öffnen" },
  "views.empty": { en: "No saved views yet.", de: "Noch keine gespeicherten Sichten." },
  "views.saving": { en: "Saving…", de: "Speichern…" },
  "silence.quiet": { en: "Quiet", de: "Stille" },
  "silence.until": { en: "Quiet until", de: "Still bis" },
  "silence.hour": { en: "1 hour", de: "1 Stunde" },
  "silence.four": { en: "4 hours", de: "4 Stunden" },
  "silence.day": { en: "24 hours", de: "24 Stunden" },
  "silence.apply": { en: "Start window", de: "Fenster starten" },
  "silence.hint": { en: "Events still arrive. No new alert opens until the window ends.", de: "Ereignisse kommen weiter an. Bis zum Ende öffnet sich kein neuer Alarm." },
  "fleet.title": { en: "Fleet", de: "Flotte" },
  "fleet.subtitle": { en: "Each server is a host you enroll an agent on.", de: "Jeder Server ist ein Host, auf dem ein Agent läuft." },
  "fleet.add": { en: "Add server", de: "Server anlegen" },
  "fleet.hostname": { en: "Hostname", de: "Hostname" },
  "fleet.description": { en: "Description", de: "Beschreibung" },
  "fleet.environment": { en: "Environment", de: "Umgebung" },
  "fleet.create": { en: "Create server", de: "Server anlegen" },
  "fleet.saving": { en: "Saving…", de: "Speichern…" },
  "fleet.empty": { en: "No servers yet", de: "Noch keine Server" },
  "fleet.emptyHint": { en: "Add a host, then issue an enrollment token from its page.", de: "Host anlegen, danach auf der Seite ein Enrollment-Token ausstellen." },
  "fleet.silent": { en: "Silent", de: "Still" },
  "fleet.reporting": { en: "Reporting", de: "Meldet sich" },
  "fleet.noAgent": { en: "No agent", de: "Kein Agent" },
  "fleet.heartbeat": { en: "Last heartbeat", de: "Letzter Heartbeat" },
  "fleet.lastEvent": { en: "Last event", de: "Letztes Ereignis" },
  "fleet.open": { en: "Open", de: "Öffnen" },
  "rules.title": { en: "Detection", de: "Erkennung" },
  "rules.subtitle": { en: "Signatures that turn matching events into alerts.", de: "Signaturen, die passende Ereignisse zu Alarmen machen." },
  "rules.new": { en: "New rule", de: "Neue Regel" },
  "rules.armed": { en: "Armed", de: "Scharf" },
  "rules.critical": { en: "Critical", de: "Kritisch" },
  "rules.high": { en: "High", de: "Hoch" },
  "rules.total": { en: "Total", de: "Gesamt" },
  "rules.search": { en: "Search name, ID, or description", de: "Name, ID oder Beschreibung suchen" },
  "rules.every": { en: "Every severity", de: "Jede Schwere" },
  "rules.none": { en: "No rules match", de: "Keine Regel passt" },
  "rules.noneHint": { en: "Adjust your search or severity filter.", de: "Suche oder Schwere anpassen." },
  "rules.edit": { en: "Edit rule", de: "Regel bearbeiten" },
  "rules.createTitle": { en: "New rule", de: "Neue Regel" },
  "rules.readonly": { en: "Read-only — you can review rules, not change them.", de: "Nur lesen — Regeln ansehen, nicht ändern." },
  "rules.pick": { en: "Pick a rule", de: "Regel wählen" },
  "rules.pickHint": { en: "Open one from the list, or start a new signature.", de: "Eine aus der Liste öffnen oder eine neue Signatur anfangen." },
  "rules.custom": { en: "Custom", de: "Eigene" },
  "rules.off": { en: "Off", de: "Aus" },
  "rules.on": { en: "Armed", de: "Scharf" },
  "rules.save": { en: "Save changes", de: "Änderungen speichern" },
  "rules.create": { en: "Create rule", de: "Regel anlegen" },
  "rules.saving": { en: "Saving…", de: "Speichern…" },
  "rules.banner": {
    en: "Fill at least one match: source, category, event type, message contains, or a field. Phrase names and alert text as a possibility, for example “Possible …”. Words like “confirmed attack” are rejected.",
    de: "Mindestens ein Match ausfüllen: Source, Category, Event type, Message contains oder ein Feld. Namen und Alert-Texte als Möglichkeit formulieren, zum Beispiel „Possible …“. Wörter wie „confirmed attack“ werden abgelehnt.",
  },
  "rules.bannerEdit": { en: " The rule id stays the same, so existing alerts keep pointing at it.", de: " Die Regel-ID bleibt gleich, damit bestehende Alarme daran hängen bleiben." },
  "rules.bannerNew": { en: " New rules get an id with the custom prefix.", de: " Neue Regeln bekommen eine ID mit dem Präfix custom." },
  "rules.f.name": { en: "Name", de: "Name" },
  "rules.f.severity": { en: "Severity", de: "Schwere" },
  "rules.f.description": { en: "Description", de: "Beschreibung" },
  "rules.f.source": { en: "Source", de: "Quelle" },
  "rules.f.category": { en: "Category", de: "Kategorie" },
  "rules.f.eventType": { en: "Event type", de: "Ereignistyp" },
  "rules.f.message": { en: "Message contains", de: "Meldung enthält" },
  "rules.f.fields": { en: "Fields, one key=value per line", de: "Felder, eine Zeile key=value" },
  "rules.f.threshold": { en: "Threshold count", de: "Schwellwert" },
  "rules.f.window": { en: "Window seconds", de: "Fenster in Sekunden" },
  "rules.f.group": { en: "Group by", de: "Gruppieren nach" },
  "rules.f.alertTitle": { en: "Alert title", de: "Alarmtitel" },
  "rules.f.alertDescription": { en: "Alert description", de: "Alarmtext" },
  "rules.h.name": { en: "Name shown in the list. Example: Possible SSH brute-force.", de: "Anzeigename in der Liste. Beispiel: Possible SSH brute-force." },
  "rules.h.severity": { en: "Weight of the alert. critical is highest, info is lowest.", de: "Gewichtung des Alarms. critical ist am höchsten, info am niedrigsten." },
  "rules.h.description": { en: "What the rule looks for and why that can be notable. This is the explanation, not the alert itself.", de: "Was die Regel sucht und warum das auffällig sein kann. Das ist der Erklärungstext, nicht der Alarm selbst." },
  "rules.h.source": { en: "Event source, for example authlog, docker, or nginx. Leave empty to allow every source.", de: "Ereignisquelle, zum Beispiel authlog, docker oder nginx. Leer lassen, wenn jede Quelle gelten soll." },
  "rules.h.category": { en: "Event category, for example auth. Must match the incoming event exactly.", de: "Kategorie des Events, zum Beispiel auth. Muss exakt zum eingehenden Event passen." },
  "rules.h.eventType": { en: "Optional exact type when the agent sets one. Otherwise leave empty.", de: "Optionaler genauer Typ, falls der Agent einen setzt. Sonst leer lassen." },
  "rules.h.message": { en: "Text that must appear in the message. Case is ignored.", de: "Text, der in der Meldung vorkommen muss. Groß- und Kleinschreibung wird nicht unterschieden." },
  "rules.h.fields": { en: "Extra fields that must match exactly. One field per line, key=value. Example: result=failed.", de: "Zusätzliche Felder, die exakt passen müssen. Eine Zeile pro Feld, Format key=value. Beispiel: result=failed." },
  "rules.h.threshold": { en: "How often the pattern must occur in the window. Empty means every match opens an alert. Otherwise at least 2.", de: "Wie oft das Muster im Zeitfenster vorkommen muss. Leer = jedes passende Event öffnet einen Alarm. Sonst mindestens 2." },
  "rules.h.window": { en: "Window in seconds for the threshold. 300 means five minutes. Only together with threshold count.", de: "Zeitfenster in Sekunden für den Schwellwert. 300 bedeutet fünf Minuten. Nur zusammen mit dem Schwellwert." },
  "rules.h.group": { en: "Count separately per value, comma-separated. src_ip counts each source IP on its own.", de: "Zählt getrennt pro Wert, kommagetrennt. src_ip zählt jede Quell-IP für sich." },
  "rules.h.alertTitle": { en: "Alert title. Placeholders like {{src_ip}} and {{host}} are filled from the event. Empty uses the rule name.", de: "Titel des Alarms. Platzhalter wie {{src_ip}} und {{host}} werden aus dem Event eingesetzt. Leer = Name der Regel." },
  "rules.h.alertDescription": { en: "Text on the alert. Leave empty to use the rule description.", de: "Text im Alarm. Leer lassen, dann wird die Beschreibung der Regel verwendet." },
  "dispatch.title": { en: "Dispatch", de: "Versand" },
  "dispatch.subtitle": { en: "Where alerts go, and which ones are worth sending.", de: "Wohin Alarme gehen, und welche es wert sind." },
  "dispatch.channels": { en: "Channels", de: "Kanäle" },
  "dispatch.add": { en: "Add", de: "Neu" },
  "dispatch.noChannels": { en: "No channels", de: "Keine Kanäle" },
  "dispatch.noChannelsHint": { en: "Add Discord, Slack, a webhook, or email.", de: "Discord, Slack, einen Webhook oder E-Mail anlegen." },
  "dispatch.sending": { en: "Sending", de: "Sendet" },
  "dispatch.paused": { en: "Paused", de: "Pausiert" },
  "dispatch.newChannel": { en: "New channel", de: "Neuer Kanal" },
  "dispatch.channel": { en: "Channel", de: "Kanal" },
  "dispatch.type": { en: "Type", de: "Typ" },
  "dispatch.smtp": { en: "SMTP host", de: "SMTP-Host" },
  "dispatch.port": { en: "Port", de: "Port" },
  "dispatch.from": { en: "From", de: "Von" },
  "dispatch.to": { en: "To (comma separated)", de: "An (kommagetrennt)" },
  "dispatch.username": { en: "Username", de: "Benutzername" },
  "dispatch.password": { en: "Password", de: "Passwort" },
  "dispatch.webhook": { en: "Webhook URL", de: "Webhook-URL" },
  "dispatch.createChannel": { en: "Create channel", de: "Kanal anlegen" },
  "dispatch.enabled": { en: "Enabled", de: "Aktiv" },
  "dispatch.test": { en: "Send test", de: "Test senden" },
  "dispatch.testing": { en: "Sending…", de: "Senden…" },
  "dispatch.pickChannel": { en: "Select a channel", de: "Kanal wählen" },
  "dispatch.pickChannelHint": { en: "Test it, pause it, or add a new destination.", de: "Testen, pausieren oder ein neues Ziel anlegen." },
  "dispatch.log": { en: "Delivery log", de: "Versandprotokoll" },
  "dispatch.logEmpty": { en: "Nothing has been sent on this channel yet.", de: "Über diesen Kanal wurde noch nichts gesendet." },
  "dispatch.routes": { en: "Routes", de: "Routen" },
  "dispatch.noRoutes": { en: "No routes", de: "Keine Routen" },
  "dispatch.noRoutesHint": { en: "Set a severity floor and the channels that should hear about it.", de: "Eine Untergrenze für die Schwere setzen und die Kanäle, die davon hören sollen." },
  "dispatch.newRoute": { en: "New route", de: "Neue Route" },
  "dispatch.route": { en: "Route", de: "Route" },
  "dispatch.min": { en: "Minimum severity", de: "Mindestschwere" },
  "dispatch.triggers": { en: "Triggers", de: "Auslöser" },
  "dispatch.channelsField": { en: "Channels", de: "Kanäle" },
  "dispatch.needChannel": { en: "Create a channel first.", de: "Zuerst einen Kanal anlegen." },
  "dispatch.createRule": { en: "Create rule", de: "Route anlegen" },
  "dispatch.pickRoute": { en: "Select a route", de: "Route wählen" },
  "dispatch.pickRouteHint": { en: "See which alerts it forwards, or add a new one.", de: "Sehen, welche Alarme sie weiterleitet, oder eine neue anlegen." },
  "login.signIn": { en: "Sign in", de: "Anmelden" },
  "login.confirm": { en: "Confirm it is you", de: "Bestätigen, dass du es bist" },
  "login.lead": { en: "Use the operator account for this panel.", de: "Das Operatorkonto für dieses Panel verwenden." },
  "login.codeLead": { en: "Enter the code from your authenticator.", de: "Den Code aus der Authenticator-App eingeben." },
  "login.email": { en: "Email", de: "E-Mail" },
  "login.password": { en: "Password", de: "Passwort" },
  "login.show": { en: "Show", de: "Zeigen" },
  "login.hide": { en: "Hide", de: "Verbergen" },
  "login.code": { en: "Authenticator code", de: "Authenticator-Code" },
  "login.submit": { en: "Sign in", de: "Anmelden" },
  "login.verify": { en: "Verify code", de: "Code prüfen" },
  "login.working": { en: "Working…", de: "Bitte warten…" },
  "login.other": { en: "Use a different account", de: "Anderes Konto verwenden" },
  "login.aside": { en: "See what is happening on the hosts you watch.", de: "Sehen, was auf den beobachteten Hosts passiert." },
  "login.asideBody": { en: "Alerts, events, and the people who can act on them live in one workspace.", de: "Alarme, Ereignisse und die Leute, die handeln können, in einer Fläche." },
  "common.of": { en: "of", de: "von" },
  "common.loading": { en: "Loading…", de: "Wird geladen…" },
  "common.default": { en: "default", de: "Standard" },
  "status.ALL": { en: "All statuses", de: "Jeder Status" },
  "status.OPEN": { en: "Open", de: "Offen" },
  "status.ACKNOWLEDGED": { en: "Acknowledged", de: "Bestätigt" },
  "status.INVESTIGATING": { en: "Investigating", de: "In Untersuchung" },
  "status.RESOLVED": { en: "Resolved", de: "Erledigt" },
  "rules.fieldError": { en: "Each field line must look like key=value", de: "Jede Feldzeile muss key=value sein" },
  "rules.toggleFailed": { en: "Could not change the rule", de: "Regel konnte nicht geändert werden" },
  "rules.saveFailed": { en: "Could not save the rule", de: "Regel konnte nicht gespeichert werden" },
  "rules.arm": { en: "Arm", de: "Scharf schalten" },
  "rules.ph.name": { en: "Possible repeated sudo", de: "Possible repeated sudo" },
  "rules.ph.alertTitle": { en: "Possible sudo from {{src_ip}}", de: "Possible sudo from {{src_ip}}" },
  "rules.ph.alertDesc": { en: "Defaults to the rule description", de: "Standard ist die Regelbeschreibung" },
  "fleet.note": { en: "Note", de: "Notiz" },
  "fleet.cannot": { en: "Cannot load servers", de: "Server können nicht geladen werden" },
  "fleet.noHost": { en: "No servers", de: "Keine Server" },
  "fleet.noHostHint": { en: "Add a host, then open it to issue an enrollment token.", de: "Host anlegen und öffnen, um ein Enrollment-Token auszustellen." },
  "fleet.createFailed": { en: "Could not create the server", de: "Server konnte nicht angelegt werden" },
  "host.notFound": { en: "Server not found", de: "Server nicht gefunden" },
  "host.agents": { en: "Agents", de: "Agenten" },
  "host.environment": { en: "Environment", de: "Umgebung" },
  "host.enrolled": { en: "Enrolled", de: "Eingeschrieben" },
  "host.onHost": { en: "Agents on this host", de: "Agenten auf diesem Host" },
  "host.none": { en: "No agents enrolled", de: "Keine Agenten eingeschrieben" },
  "host.noneHint": { en: "Issue a token and start the agent on the host.", de: "Token ausstellen und den Agenten auf dem Host starten." },
  "host.noHeartbeat": { en: "no heartbeat yet", de: "noch kein Heartbeat" },
  "host.enroll": { en: "Enroll an agent", de: "Agent einschreiben" },
  "host.enrollHint": { en: "One-time senr_… token for the agent on this host. Shown only once — copy it now.", de: "Einmaliges senr_… Token für den Agenten auf diesem Host. Wird nur einmal gezeigt — jetzt kopieren." },
  "host.label": { en: "Label", de: "Bezeichnung" },
  "host.ttl": { en: "TTL (minutes)", de: "Gültigkeit (Minuten)" },
  "host.issue": { en: "Issue enrollment token", de: "Enrollment-Token ausstellen" },
  "host.issuing": { en: "Issuing…", de: "Wird ausgestellt…" },
  "host.copyNow": { en: "Copy now — will not be shown again", de: "Jetzt kopieren — wird nicht erneut gezeigt" },
  "host.expires": { en: "Expires", de: "Läuft ab" },
  "host.prefix": { en: "prefix", de: "Präfix" },
  "host.copy": { en: "Copy token", de: "Token kopieren" },
  "host.copied": { en: "Copied", de: "Kopiert" },
  "host.tokenFailed": { en: "Could not create the token", de: "Token konnte nicht erstellt werden" },
  "host.back": { en: "Fleet", de: "Flotte" },
  "dispatch.trigger.created": { en: "Alert created", de: "Alarm erstellt" },
  "dispatch.trigger.updated": { en: "Alert updated", de: "Alarm aktualisiert" },
  "dispatch.trigger.status": { en: "Alert status changed", de: "Alarmstatus geändert" },
  "dispatch.on": { en: "on", de: "an" },
  "dispatch.off": { en: "off", de: "aus" },
  "dispatch.channelCount": { en: "channels", de: "Kanäle" },
  "dispatch.email": { en: "Email", de: "E-Mail" },
  "dispatch.status.sent": { en: "Sent", de: "Gesendet" },
  "dispatch.status.failed": { en: "Failed", de: "Fehler" },
  "dispatch.status.pending": { en: "Pending", de: "Ausstehend" },
  "dispatch.deleteChannel": { en: "Delete this notification channel?", de: "Diesen Kanal löschen?" },
  "dispatch.deleteRoute": { en: "Delete this route?", de: "Diese Route löschen?" },
  "people.title": { en: "People", de: "Personen" },
  "people.subtitle": { en: "Who can sign in, what they can do, and which sessions are live.", de: "Wer sich anmelden kann, was die Person darf, und welche Sitzungen laufen." },
  "access.title": { en: "Access", de: "Zugriff" },
  "access.subtitle": { en: "Choose a role, decide which pages it opens, then put people on it.", de: "Rolle wählen, Seiten festlegen und Personen zuweisen." },
  "access.loading": { en: "Loading access...", de: "Zugriff wird geladen..." },
  "access.new": { en: "New role", de: "Neue Rolle" },
  "audit.title": { en: "Audit", de: "Audit" },
  "audit.subtitle": { en: "Every privileged change, with the person who made it.", de: "Jede privilegierte Änderung, mit der Person, die sie gemacht hat." },
  "alert.notFound": { en: "Alert not found", de: "Alarm nicht gefunden" },
  "alert.back": { en: "Back to alerts", de: "Zurück zu den Alarmen" },
  "alert.loading": { en: "Loading alert…", de: "Alarm wird geladen…" },
  "alert.noDescription": { en: "No description provided.", de: "Keine Beschreibung." },
  "alert.queue": { en: "Queue", de: "Warteschlange" },
  "alert.record": { en: "Record", de: "Datensatz" },
  "alert.timeline": { en: "Timeline", de: "Verlauf" },
  "alert.noTimeline": { en: "No timeline events yet.", de: "Noch keine Verlaufseinträge." },
  "alert.opened": { en: "Opened", de: "Geöffnet" },
  "alert.resolved": { en: "Resolved", de: "Erledigt" },
  "action.reopen": { en: "Reopen", de: "Wieder öffnen" },
  "action.ack": { en: "Acknowledge", de: "Bestätigen" },
  "action.investigating": { en: "Mark investigating", de: "Als Untersuchung markieren" },
  "action.resolved": { en: "Mark resolved", de: "Als erledigt markieren" },
};

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

function initialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "de" || stored === "en") return stored;
  return window.navigator.language.toLowerCase().startsWith("de") ? "de" : "en";
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const next = initialLocale();
    setLocaleState(next);
    document.documentElement.lang = next;
    setReady(true);
  }, []);

  const value = useMemo<I18nValue>(() => {
    return {
      locale,
      setLocale: (next) => {
        setLocaleState(next);
        window.localStorage.setItem(STORAGE_KEY, next);
        document.documentElement.lang = next;
      },
      t: (key) => TEXT[key]?.[locale] || TEXT[key]?.en || key,
    };
  }, [locale]);

  void ready;
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) {
    return {
      locale: "en" as Locale,
      setLocale: () => undefined,
      t: (key: string) => TEXT[key]?.en || key,
    };
  }
  return value;
}

export function LanguageSelect({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <select
      aria-label={t("lang.label")}
      className={className || "form-select form-select-sm"}
      style={{ width: 112 }}
      value={locale}
      onChange={(event) => setLocale(event.target.value === "de" ? "de" : "en")}
    >
      <option value="en">English</option>
      <option value="de">Deutsch</option>
    </select>
  );
}

export function severityLabel(t: (key: string) => string, value: string) {
  const key = `dash.sev.${value.toLowerCase()}`;
  const label = t(key);
  return label === key ? value : label;
}

export function statusLabel(t: (key: string) => string, value: string) {
  const key = `status.${value}`;
  const label = t(key);
  return label === key ? value : label;
}

export function actionLabel(t: (key: string) => string, status: string) {
  switch (status) {
    case "OPEN":
      return t("action.reopen");
    case "ACKNOWLEDGED":
      return t("action.ack");
    case "INVESTIGATING":
      return t("action.investigating");
    case "RESOLVED":
      return t("action.resolved");
    default:
      return status;
  }
}
