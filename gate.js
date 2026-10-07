/*
 * Draft contract for a Grok Bot usage-headroom gate.
 * Not a live API. Settings → Usage does not expose this to a bot today.
 *
 * A routine reads one snapshot at fire time. The snapshot is the included
 * weekly pool only: used percent, the reset instant (date and clock), and
 * the time remaining. It is not a per-bot or per-category breakdown.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.HeadroomGate = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  var DAY_MS = 24 * 60 * 60 * 1000;

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function isoDuration(ms) {
    var left = Math.max(0, Math.floor(ms / 1000));
    var days = Math.floor(left / 86400);
    left -= days * 86400;
    var hours = Math.floor(left / 3600);
    left -= hours * 3600;
    var minutes = Math.floor(left / 60);
    left -= minutes * 60;
    var out = "P";
    if (days) out += days + "D";
    if (hours || minutes || left || !days) {
      out += "T";
      if (hours) out += hours + "H";
      if (minutes) out += minutes + "M";
      if (left || (!hours && !minutes)) out += left + "S";
    }
    return out;
  }

  function humanRemaining(ms) {
    var totalMin = Math.floor(Math.max(0, ms) / 60000);
    var days = Math.floor(totalMin / (60 * 24));
    var hours = Math.floor((totalMin - days * 60 * 24) / 60);
    var minutes = totalMin % 60;
    return days + "d " + hours + "h " + minutes + "m";
  }

  function formatPercent(n) {
    var rounded = round1(n);
    return (Math.round(rounded) === rounded ? String(Math.round(rounded)) : rounded.toFixed(1)) + "%";
  }

  function readSnapshot(input) {
    if (!input || typeof input.usedPercent !== "number" || !isFinite(input.usedPercent)) {
      throw new Error("usedPercent is required");
    }
    if (input.usedPercent < 0 || input.usedPercent > 100) {
      throw new Error("usedPercent must be between 0 and 100");
    }
    var resetsAt = Date.parse(input.resetsAt);
    var asOf = Date.parse(input.asOf);
    if (!isFinite(resetsAt)) throw new Error("resetsAt must be an exact timestamp");
    if (!isFinite(asOf)) throw new Error("asOf must be an exact timestamp");
    var periodStart = resetsAt - WEEK_MS;
    var elapsedMs = Math.min(Math.max(asOf - periodStart, 0), WEEK_MS);
    var remainingMs = Math.max(resetsAt - asOf, 0);
    var elapsedPercent = (elapsedMs / WEEK_MS) * 100;
    var resetsDate = new Date(resetsAt);
    if (
      resetsDate.getUTCHours() === 0 &&
      resetsDate.getUTCMinutes() === 0 &&
      resetsDate.getUTCSeconds() === 0 &&
      input.dateOnly === true
    ) {
      throw new Error("resetsAt is date-only; a clock time is required");
    }
    return {
      kind: "grok_bot.usage.weekly_included",
      draft: true,
      matches: "settings.usage",
      pool: "included_weekly",
      usedPercent: round1(input.usedPercent),
      resetsAt: new Date(resetsAt).toISOString(),
      asOf: new Date(asOf).toISOString(),
      timeUntilReset: isoDuration(remainingMs),
      timeUntilResetMs: remainingMs,
      daysUntilReset: remainingMs / DAY_MS,
      weekElapsedPercent: round1(elapsedPercent),
      aheadOfEvenPace: input.usedPercent > elapsedPercent,
    };
  }

  function routineHasGate(routine) {
    return routine.usageCeiling != null || routine.minDaysUntilReset != null || routine.paceHold === true;
  }

  function evaluateRoutine(routine, snapshot) {
    var blocks = [];
    if (routine.usageCeiling != null && snapshot.usedPercent >= routine.usageCeiling) {
      blocks.push(
        "Weekly usage " +
          formatPercent(snapshot.usedPercent) +
          " is not under " +
          formatPercent(routine.usageCeiling) +
          "."
      );
    }
    if (routine.minDaysUntilReset != null && snapshot.daysUntilReset < routine.minDaysUntilReset) {
      blocks.push(
        humanRemaining(snapshot.timeUntilResetMs) +
          " until reset is under " +
          routine.minDaysUntilReset +
          (routine.minDaysUntilReset === 1 ? " day." : " days.")
      );
    }
    if (routine.paceHold === true && snapshot.usedPercent > snapshot.weekElapsedPercent) {
      blocks.push(
        "Ahead of even pace: used " +
          formatPercent(snapshot.usedPercent) +
          ", week elapsed " +
          formatPercent(snapshot.weekElapsedPercent) +
          "."
      );
    }

    var base = {
      routineId: routine.id,
      asOf: snapshot.asOf,
      resetsAt: snapshot.resetsAt,
      timeUntilReset: snapshot.timeUntilReset,
      usedPercentSeen: snapshot.usedPercent,
      weekElapsedPercentSeen: snapshot.weekElapsedPercent,
    };

    if (blocks.length === 0) {
      var reason = "Headroom gate passed.";
      if (!routineHasGate(routine)) {
        reason = "No gate. This run starts even if the week is ahead of pace.";
      } else if (routine.paceHold === true) {
        reason =
          "Headroom gate passed. At or behind even pace: used " +
          formatPercent(snapshot.usedPercent) +
          ", week elapsed " +
          formatPercent(snapshot.weekElapsedPercent) +
          ".";
      }
      return Object.assign(base, {
        decision: "start",
        started: true,
        usageSpent: true,
        reason: reason,
      });
    }

    return Object.assign(base, {
      decision: "skip",
      started: false,
      usageSpent: false,
      reason: blocks.join(" "),
    });
  }

  function freshLatches(thresholds, usedPercent) {
    var latches = {};
    thresholds.forEach(function (threshold) {
      latches[String(threshold)] = {
        threshold: threshold,
        armed: usedPercent < threshold,
        deliveries: [],
      };
    });
    return latches;
  }

  function noteCrossings(previousPercent, nextPercent, thresholds, latches, at) {
    var alerts = [];
    var next = {};
    thresholds.forEach(function (threshold) {
      var key = String(threshold);
      var prev = (latches && latches[key]) || {
        threshold: threshold,
        armed: previousPercent < threshold,
        deliveries: [],
      };
      var armed = prev.armed;
      var deliveries = prev.deliveries.slice();
      if (nextPercent < threshold) {
        armed = true;
      } else if (armed && previousPercent < threshold && nextPercent >= threshold) {
        var alert = {
          threshold: threshold,
          usedPercentSeen: round1(nextPercent),
          at: at,
          oncePerCrossing: true,
        };
        deliveries.push(alert);
        alerts.push(alert);
        armed = false;
      } else {
        armed = false;
      }
      next[key] = { threshold: threshold, armed: armed, deliveries: deliveries };
    });
    return { alerts: alerts, latches: next };
  }

  return {
    WEEK_MS: WEEK_MS,
    DAY_MS: DAY_MS,
    round1: round1,
    isoDuration: isoDuration,
    humanRemaining: humanRemaining,
    formatPercent: formatPercent,
    readSnapshot: readSnapshot,
    evaluateRoutine: evaluateRoutine,
    freshLatches: freshLatches,
    noteCrossings: noteCrossings,
  };
});
