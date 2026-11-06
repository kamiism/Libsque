import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SharedBench } from "../components/Illustrations";
import {
  getDiscoverReaders,
  getMutualMatches,
  sendInterest,
  withdrawInterest,
  unmatchReader,
  blockReader,
  reportReader,
  updateSocialPreferences,
} from "../utils/socialApi";

function Feed() {
  const [loading, setLoading] = useState(true);
  const [optedIn, setOptedIn] = useState(false);
  const [readers, setReaders] = useState([]);
  const [matches, setMatches] = useState([]);
  const [activeTab, setActiveTab] = useState("all"); // "all" | "friends" | "dating" | "matches"
  const [userIntent, setUserIntent] = useState("friends");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [actionLoading, setActionLoading] = useState({});

  // Celebration Modal state for new mutual matches
  const [celebrationMatch, setCelebrationMatch] = useState(null);

  // Report Modal state
  const [reportModalUser, setReportModalUser] = useState(null);
  const [reportReason, setReportReason] = useState("inappropriate_content");
  const [reportDetails, setReportDetails] = useState("");
  const [reportAutoBlock, setReportAutoBlock] = useState(true);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadDiscovery() {
      setLoading(true);
      try {
        const discoverData = await getDiscoverReaders(activeTab === "matches" ? "all" : activeTab);
        if (isMounted) {
          setOptedIn(discoverData.optedIn);
          setUserIntent(discoverData.userIntent || "friends");
          setAdultConfirmed(Boolean(discoverData.adultConfirmed));
          setReaders(discoverData.readers || []);
        }

        try {
          const matchData = await getMutualMatches();
          if (isMounted) {
            setMatches(matchData.matches || []);
          }
        } catch {
          // Keep empty if none
        }
      } catch (err) {
        console.error("Failed to load discovery:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDiscovery();
    return () => {
      isMounted = false;
    };
  }, [activeTab]);

  async function handleQuickOptIn() {
    try {
      setLoading(true);
      await updateSocialPreferences({
        discoveryOptIn: true,
        intent: "friends",
        adultConfirmed: false,
      });
      const discoverData = await getDiscoverReaders("all");
      setOptedIn(true);
      setReaders(discoverData.readers || []);
    } catch (err) {
      alert("Failed to opt in: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendInterest(targetUserId, intentType) {
    setActionLoading((prev) => ({ ...prev, [targetUserId]: true }));
    try {
      const res = await sendInterest(targetUserId, intentType);
      if (res.status === "matched") {
        const matchedCandidate = readers.find((r) => r.userId === targetUserId);
        setCelebrationMatch({
          partner: matchedCandidate || { userId: targetUserId, displayName: "Reader", username: "reader" },
          type: res.match?.type || intentType,
        });
      }
      // Refresh state
      const discoverData = await getDiscoverReaders(activeTab === "matches" ? "all" : activeTab);
      setReaders(discoverData.readers || []);
      const matchData = await getMutualMatches();
      setMatches(matchData.matches || []);
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading((prev) => ({ ...prev, [targetUserId]: false }));
    }
  }

  async function handleWithdrawInterest(targetUserId) {
    setActionLoading((prev) => ({ ...prev, [targetUserId]: true }));
    try {
      await withdrawInterest(targetUserId);
      const discoverData = await getDiscoverReaders(activeTab === "matches" ? "all" : activeTab);
      setReaders(discoverData.readers || []);
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading((prev) => ({ ...prev, [targetUserId]: false }));
    }
  }

  async function handleUnmatch(targetUserId) {
    if (!window.confirm("Are you sure you want to unmatch? This will dissolve your connection.")) {
      return;
    }
    setActionLoading((prev) => ({ ...prev, [targetUserId]: true }));
    try {
      await unmatchReader(targetUserId);
      const discoverData = await getDiscoverReaders(activeTab === "matches" ? "all" : activeTab);
      setReaders(discoverData.readers || []);
      const matchData = await getMutualMatches();
      setMatches(matchData.matches || []);
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading((prev) => ({ ...prev, [targetUserId]: false }));
    }
  }

  async function handleBlock(targetUserId) {
    if (!window.confirm("Block this reader? They will no longer see your profile or interact with you.")) {
      return;
    }
    try {
      await blockReader(targetUserId);
      setReaders(readers.filter((r) => r.userId !== targetUserId));
      setMatches(matches.filter((m) => m.partner.userId !== targetUserId));
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleSubmitReport(e) {
    e.preventDefault();
    if (!reportModalUser) return;
    setReporting(true);
    try {
      await reportReader(
        reportModalUser.userId,
        reportReason,
        reportDetails,
        reportAutoBlock
      );
      alert("Report submitted to moderation. Thank you for helping keep Libsque safe.");
      if (reportAutoBlock) {
        setReaders(readers.filter((r) => r.userId !== reportModalUser.userId));
        setMatches(matches.filter((m) => m.partner.userId !== reportModalUser.userId));
      }
      setReportModalUser(null);
      setReportDetails("");
    } catch (err) {
      alert("Report failed: " + err.message);
    } finally {
      setReporting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0FAEF] flex items-center justify-center p-8 text-[#1D3557]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#1D3557]/20 border-t-[#E73847] animate-spin" />
          <span className="font-mono text-xs uppercase tracking-widest text-[#457B9D]">
            Finding compatible readers...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0FAEF] text-[#1D3557] px-4 py-8 sm:px-8 md:px-12 lg:px-16">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header & Intent Indicator */}
        <header className="border-b border-[#1D3557]/15 pb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <span className="font-mono text-xs uppercase tracking-widest text-[#457B9D] font-bold block mb-1">
              Social Reading & Discovery
            </span>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-black text-[#1D3557] tracking-tight">
              Discover Readers
            </h1>
          </div>

          {optedIn && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-3.5 py-1.5 rounded-full bg-white text-[#1D3557] border border-[#1D3557]/15 font-semibold shadow-xs">
                Active Intent: <span className="capitalize text-[#E73847] font-bold">{userIntent}</span>
              </span>
              <Link
                to="/profile"
                className="text-xs font-mono text-[#457B9D] hover:text-[#1D3557] px-2 py-1 font-bold underline"
              >
                Settings ↗
              </Link>
            </div>
          )}
        </header>

        {/* NOT OPTED IN NOTICE */}
        {!optedIn ? (
          <div className="bg-white border border-[#1D3557]/15 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto shadow-sm space-y-5">
            <SharedBench className="w-48 h-32 mx-auto" />
            <div className="space-y-2">
              <span className="bg-[#1D3557]/10 text-[#1D3557] font-mono text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full inline-block">
                Privacy-First Discovery
              </span>
              <h2 className="font-serif font-bold text-2xl sm:text-3xl text-[#1D3557]">
                Connect through shared taste.
              </h2>
              <p className="text-sm text-[#1D3557]/80 font-sans leading-relaxed max-w-md mx-auto">
                Libsque keeps discovery private by default. When enabled, you can browse compatible readers, compare reading compatibility, and exchange confidential interests for reading friendship or dating.
              </p>
            </div>

            {/* Privacy Transparency Callout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left p-4 rounded-2xl bg-[#F0FAEF] border border-[#1D3557]/10 text-xs font-sans">
              <div>
                <span className="font-mono font-bold text-[#2A9D8F] block mb-1">✓ Visible to Readers</span>
                <p className="text-[#1D3557]/70">Public name, bio, showcased favorite books, and literary genres.</p>
              </div>
              <div>
                <span className="font-mono font-bold text-[#E73847] block mb-1">🔒 Always Private</span>
                <p className="text-[#1D3557]/70">Email, unshared shelves, reading history, and exact location.</p>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleQuickOptIn}
                className="bg-[#E73847] hover:bg-[#d02736] text-white font-mono text-xs font-bold uppercase tracking-wider px-6 py-3.5 rounded-full transition shadow-xs cursor-pointer"
              >
                Enable Reader Discovery
              </button>
              <Link
                to="/profile"
                className="bg-white border border-[#1D3557]/20 hover:border-[#1D3557]/40 text-[#1D3557] font-mono text-xs font-bold uppercase tracking-wider px-6 py-3.5 rounded-full transition"
              >
                Customize Settings
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Filter Tabs & Reader Count */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-white border border-[#1D3557]/15 rounded-full shadow-xs">
                {[
                  { key: "all", label: "All Compatible" },
                  { key: "friends", label: "Reading Friends" },
                  ...(adultConfirmed ? [{ key: "dating", label: "Dating" }] : []),
                  {
                    key: "matches",
                    label: `Mutual Matches (${matches.length})`,
                    isMatchTab: true,
                  },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-4 py-2 rounded-full text-xs font-mono font-bold tracking-wider uppercase transition cursor-pointer flex items-center gap-1.5 ${
                      activeTab === tab.key
                        ? tab.isMatchTab
                          ? "bg-[#E73847] text-white shadow-xs"
                          : "bg-[#1D3557] text-[#F0FAEF] shadow-xs"
                        : "text-[#1D3557]/70 hover:text-[#1D3557] hover:bg-[#F0FAEF]"
                    }`}
                  >
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

              <span className="text-xs font-mono text-[#1D3557]/60">
                {activeTab === "matches"
                  ? `${matches.length} mutual match${matches.length === 1 ? "" : "es"}`
                  : `${readers.length} compatible reader${readers.length === 1 ? "" : "s"}`}
              </span>
            </div>

            {/* MUTUAL MATCHES VIEW */}
            {activeTab === "matches" ? (
              matches.length === 0 ? (
                <div className="bg-white border border-[#1D3557]/15 rounded-3xl p-10 text-center max-w-md mx-auto shadow-sm space-y-4">
                  <SharedBench className="w-40 h-28 mx-auto" />
                  <div className="space-y-1">
                    <h3 className="font-serif font-bold text-xl text-[#1D3557]">
                      No mutual matches yet
                    </h3>
                    <p className="text-xs text-[#1D3557]/70 font-sans leading-relaxed">
                      When you and another reader both express mutual interest, your connection will appear here with direct shelf access.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab("all")}
                    className="bg-[#1D3557] hover:bg-[#152740] text-white font-mono text-xs font-bold uppercase tracking-wider px-6 py-2.5 rounded-full transition cursor-pointer"
                  >
                    Explore Compatible Readers
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {matches.map((match) => (
                    <div
                      key={match.matchId}
                      className="bg-white border-2 border-[#E73847]/30 rounded-3xl p-6 shadow-xs flex flex-col justify-between relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 bg-[#E73847] text-white px-3.5 py-1 rounded-bl-xl font-mono text-[10px] font-bold uppercase tracking-wider">
                        Mutual Connection • {match.type}
                      </div>

                      <div className="space-y-4">
                        {/* Enlarged Reader Identity */}
                        <div className="flex items-center gap-4 pt-1 pr-24">
                          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#E73847]/10 border border-[#E73847]/20 flex items-center justify-center shrink-0">
                            <span className="font-serif font-black text-2xl text-[#E73847]">
                              {match.partner.displayName?.charAt(0) || "M"}
                            </span>
                          </div>
                          <div>
                            <h3 className="font-serif font-black text-xl text-[#1D3557]">
                              {match.partner.displayName}
                            </h3>
                            <p className="font-mono text-xs sm:text-sm text-[#457B9D]">
                              @{match.partner.username}
                            </p>
                          </div>
                        </div>

                        <p className="text-xs sm:text-sm text-[#1D3557]/80 font-sans line-clamp-2 leading-relaxed">
                          {match.partner.bio || "Fellow reader exploring stories on Libsque."}
                        </p>

                        {/* Showcase 2-3 Real Favorite Book Covers */}
                        {match.partner.selectedFavorites?.length > 0 && (
                          <div className="space-y-2">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-[#1D3557]/60 block font-bold">
                              Favorite Books
                            </span>
                            <div className="flex items-center gap-3">
                              {match.partner.selectedFavorites.slice(0, 3).map((b) => (
                                <div
                                  key={b.id || b.title}
                                  className="group/b flex flex-col w-16 sm:w-18 shrink-0"
                                  title={`${b.title}${b.author ? ` by ${b.author}` : ""}`}
                                >
                                  <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden bg-[#F0FAEF] border border-[#1D3557]/15 shadow-xs mb-1 group-hover/b:-translate-y-0.5 transition">
                                    {b.coverId ? (
                                      <img
                                        src={`https://covers.openlibrary.org/b/id/${b.coverId}-M.jpg`}
                                        alt={b.title}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <div className="p-1 text-center text-[9px] font-serif font-bold text-[#1D3557]/80 flex items-center justify-center h-full bg-[#A8DADB]/20 line-clamp-3 leading-tight">
                                        {b.title}
                                      </div>
                                    )}
                                  </div>
                                  <p className="text-[11px] font-serif font-bold text-[#1D3557] line-clamp-1">
                                    {b.title}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Primary Action: View Profile | Secondary Action: Unmatch */}
                      <div className="pt-4 mt-4 border-t border-[#1D3557]/10 flex items-center justify-between gap-3">
                        <Link
                          to={`/user/${match.partner.userId}`}
                          className="bg-[#1D3557] hover:bg-[#152740] text-white font-mono text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-full transition shadow-xs"
                        >
                          View Profile
                        </Link>

                        <button
                          onClick={() => handleUnmatch(match.partner.userId)}
                          disabled={actionLoading[match.partner.userId]}
                          className="text-xs font-mono text-[#1D3557]/45 hover:text-[#E73847] transition cursor-pointer"
                        >
                          Unmatch
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : readers.length === 0 ? (
              <div className="bg-white border border-[#1D3557]/15 rounded-3xl p-10 text-center max-w-md mx-auto shadow-sm space-y-4">
                <SharedBench className="w-40 h-28 mx-auto" />
                <div className="space-y-1">
                  <h3 className="font-serif font-bold text-xl text-[#1D3557]">
                    The reading room is calm.
                  </h3>
                  <p className="text-xs text-[#1D3557]/70 font-sans leading-relaxed">
                    No other opted-in readers match this specific intent filter right now. Try switching tabs or invite friends to catalog their shelves.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab("all")}
                  className="bg-[#1D3557] text-white font-mono text-xs font-bold uppercase tracking-wider px-6 py-2.5 rounded-full"
                >
                  View All Readers
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {readers.map((reader) => {
                  const comp = reader.compatibility || {};
                  const isBusy = actionLoading[reader.userId];

                  return (
                    <div
                      key={reader.userId}
                      className="bg-white border border-[#1D3557]/15 hover:border-[#1D3557]/30 rounded-3xl p-6 shadow-xs hover:shadow-md transition duration-200 flex flex-col justify-between"
                    >
                      <div className="space-y-4">
                        {/* Header: Enlarged Reader Avatar, Names & Reading Compatibility */}
                        <div className="flex items-start justify-between gap-3">
                          <Link
                            to={`/user/${reader.userId}`}
                            className="flex items-center gap-3.5 group"
                          >
                            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#A8DADB]/25 border border-[#1D3557]/15 flex items-center justify-center shrink-0">
                              <span className="font-serif font-black text-xl sm:text-2xl text-[#1D3557]">
                                {reader.displayName?.charAt(0) || "R"}
                              </span>
                            </div>
                            <div>
                              <h2 className="font-serif font-black text-xl text-[#1D3557] group-hover:text-[#E73847] transition">
                                {reader.displayName}
                              </h2>
                              <p className="font-mono text-xs sm:text-sm text-[#457B9D]">
                                @{reader.username}
                              </p>
                            </div>
                          </Link>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {reader.isMatched ? (
                              <span className="bg-[#E73847] text-white px-3 py-1 rounded-full font-mono text-[11px] font-bold shadow-xs">
                                Matched ❤️
                              </span>
                            ) : comp.score !== null ? (
                              <span className="bg-[#E73847]/10 text-[#E73847] border border-[#E73847]/20 px-3 py-1 rounded-full font-mono text-[11px] font-bold">
                                {comp.score}% Reading Compatibility
                              </span>
                            ) : (
                              <span className="bg-[#1D3557]/10 text-[#1D3557]/70 px-2.5 py-1 rounded-full font-mono text-[10px]">
                                {comp.label || "New Shelf"}
                              </span>
                            )}

                            <span className="text-[10px] font-mono text-[#457B9D] uppercase tracking-wider">
                              {reader.intent === "both"
                                ? "Friends & Dating"
                                : reader.intent === "dating"
                                ? "Dating"
                                : "Reading Friends"}
                            </span>
                          </div>
                        </div>

                        {/* Concrete Reading Compatibility insight or neutral low-data description */}
                        {comp.explanation && (
                          <div className="p-3 rounded-xl bg-[#A8DADB]/15 border-l-3 border-[#457B9D] text-xs font-sans text-[#1D3557]/85 leading-relaxed">
                            <span className="font-bold text-[#1D3557]">
                              {comp.label || "Reading Compatibility"}:
                            </span>{" "}
                            {comp.explanation}
                          </div>
                        )}

                        {/* Bio */}
                        <p className="text-xs sm:text-sm text-[#1D3557]/80 font-sans line-clamp-2 leading-relaxed">
                          {reader.bio || "Curating favorite reads and exploring stories."}
                        </p>

                        {/* Showcase 2-3 Real Favorite Book Covers */}
                        {reader.selectedFavorites?.length > 0 && (
                          <div className="space-y-2">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-[#1D3557]/60 block font-bold">
                              Favorite Books
                            </span>
                            <div className="flex items-center gap-3">
                              {reader.selectedFavorites.slice(0, 3).map((fav) => (
                                <div
                                  key={fav.id || fav.title}
                                  className="group/b flex flex-col w-16 sm:w-18 shrink-0"
                                  title={`${fav.title}${fav.author ? ` by ${fav.author}` : ""}`}
                                >
                                  <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden bg-[#F0FAEF] border border-[#1D3557]/15 shadow-xs mb-1 group-hover/b:-translate-y-0.5 transition">
                                    {fav.coverId ? (
                                      <img
                                        src={`https://covers.openlibrary.org/b/id/${fav.coverId}-M.jpg`}
                                        alt={fav.title}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <div className="p-1 text-center text-[9px] font-serif font-bold text-[#1D3557]/80 flex items-center justify-center h-full bg-[#A8DADB]/20 line-clamp-3 leading-tight">
                                        {fav.title}
                                      </div>
                                    )}
                                  </div>
                                  <p className="text-[11px] font-serif font-bold text-[#1D3557] line-clamp-1">
                                    {fav.title}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Footer Actions: Primary View Profile for matches; Connect/Sent otherwise */}
                      <div className="pt-4 mt-4 border-t border-[#1D3557]/10 flex flex-wrap items-center justify-between gap-2.5">
                        {/* Top Genres */}
                        <div className="flex flex-wrap gap-1">
                          {(reader.readerDnaSummary?.topGenres || []).slice(0, 3).map((genre) => (
                            <span
                              key={genre}
                              className="bg-[#1D3557]/5 text-[#1D3557]/80 px-2.5 py-0.5 rounded-full font-mono text-[10px] capitalize"
                            >
                              {genre}
                            </span>
                          ))}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          {reader.isMatched ? (
                            <Link
                              to={`/user/${reader.userId}`}
                              className="bg-[#1D3557] hover:bg-[#152740] text-white font-mono text-[11px] font-bold px-4 py-1.5 rounded-full transition shadow-xs"
                            >
                              View Profile
                            </Link>
                          ) : reader.hasSentInterest ? (
                            <button
                              onClick={() => handleWithdrawInterest(reader.userId)}
                              disabled={isBusy}
                              className="bg-[#A8DADB]/30 hover:bg-[#A8DADB]/50 text-[#1D3557] font-mono text-[11px] font-bold px-3.5 py-1.5 rounded-full transition cursor-pointer"
                              title="Click to withdraw interest"
                            >
                              Sent ✓ (Withdraw)
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleSendInterest(reader.userId, "friends")}
                                disabled={isBusy}
                                className="bg-[#1D3557] hover:bg-[#152740] text-white font-mono text-[11px] font-bold px-4 py-1.5 rounded-full transition cursor-pointer shadow-xs disabled:opacity-50"
                              >
                                Connect
                              </button>

                              {adultConfirmed &&
                                (reader.intent === "dating" || reader.intent === "both") && (
                                  <button
                                    onClick={() => handleSendInterest(reader.userId, "dating")}
                                    disabled={isBusy}
                                    className="bg-[#E73847] hover:bg-[#d02736] text-white font-mono text-[11px] font-bold px-4 py-1.5 rounded-full transition cursor-pointer shadow-xs disabled:opacity-50"
                                  >
                                    Dating 💌
                                  </button>
                                )}
                            </div>
                          )}

                          {/* Secondary Actions Menu: Unmatch (if matched), Report & Block */}
                          <div className="flex items-center gap-1 border-l border-[#1D3557]/15 pl-1.5">
                            {reader.isMatched && (
                              <button
                                onClick={() => handleUnmatch(reader.userId)}
                                disabled={isBusy}
                                className="text-[#1D3557]/45 hover:text-[#E73847] p-1 text-xs cursor-pointer font-mono"
                                title="Unmatch Connection"
                              >
                                Unmatch
                              </button>
                            )}
                            <button
                              onClick={() => setReportModalUser(reader)}
                              className="text-[#1D3557]/40 hover:text-[#E73847] p-1 text-xs cursor-pointer"
                              title="Report Reader"
                            >
                              🚩
                            </button>
                            <button
                              onClick={() => handleBlock(reader.userId)}
                              className="text-[#1D3557]/40 hover:text-[#1D3557] p-1 text-xs cursor-pointer font-mono"
                              title="Block Reader"
                            >
                              🚫
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* MUTUAL MATCH CELEBRATION MODAL */}
        {celebrationMatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white border-2 border-[#E73847] rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl text-center space-y-4">
              <span className="text-xs font-mono uppercase tracking-widest text-[#E73847] font-bold block">
                Mutual Reading Connection
              </span>
              <h3 className="font-serif font-black text-2xl sm:text-3xl text-[#1D3557]">
                A Literary Match!
              </h3>
              <p className="text-sm text-[#1D3557]/80 font-sans leading-relaxed">
                You and <strong className="text-[#1D3557] font-serif">{celebrationMatch.partner?.displayName}</strong> both expressed interest in connecting for{" "}
                <span className="font-bold text-[#E73847]">{celebrationMatch.type}</span>.
              </p>

              <div className="p-4 rounded-2xl bg-[#F0FAEF] border border-[#1D3557]/10 flex items-center justify-center gap-3">
                <span className="font-serif font-bold text-lg text-[#1D3557]">
                  {celebrationMatch.partner?.displayName}
                </span>
                <span className="font-mono text-xs text-[#457B9D]">
                  @{celebrationMatch.partner?.username}
                </span>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2.5 justify-center">
                <Link
                  to={`/user/${celebrationMatch.partner?.userId}`}
                  onClick={() => setCelebrationMatch(null)}
                  className="bg-[#E73847] hover:bg-[#d02736] text-white font-mono text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-full transition shadow-xs"
                >
                  View Profile
                </Link>
                <button
                  type="button"
                  onClick={() => setCelebrationMatch(null)}
                  className="bg-white border border-[#1D3557]/20 hover:border-[#1D3557]/40 text-[#1D3557] font-mono text-xs font-bold uppercase tracking-wider px-5 py-3 rounded-full transition cursor-pointer"
                >
                  Continue Browsing
                </button>
              </div>
            </div>
          </div>
        )}

        {/* REPORT MODAL */}
        {reportModalUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white border border-[#1D3557]/20 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-xl space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#E73847] font-bold">
                    Community Safety
                  </span>
                  <h3 className="font-serif font-bold text-xl text-[#1D3557] mt-0.5">
                    Report @{reportModalUser.username}
                  </h3>
                </div>
                <button
                  onClick={() => setReportModalUser(null)}
                  className="text-[#1D3557]/60 hover:text-[#1D3557] text-lg cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmitReport} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-[#1D3557]/80 font-bold mb-1">
                    Reason
                  </label>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-[#1D3557]/20 text-xs font-sans bg-[#F0FAEF] focus:outline-hidden"
                  >
                    <option value="inappropriate_content">Inappropriate Content or Bio</option>
                    <option value="harassment">Harassment or Unwelcome Messages</option>
                    <option value="underage_dating">Suspected Underage on Dating Mode</option>
                    <option value="spam">Spam or Commercial Solicitation</option>
                    <option value="impersonation">Impersonation or False Identity</option>
                    <option value="other">Other Violation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-[#1D3557]/80 font-bold mb-1">
                    Details (Optional)
                  </label>
                  <textarea
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    placeholder="Provide context for our moderation team..."
                    className="w-full p-2.5 rounded-xl border border-[#1D3557]/20 text-xs font-sans bg-[#F0FAEF] min-h-20 focus:outline-hidden"
                    maxLength={1000}
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-sans text-[#1D3557]">
                  <input
                    type="checkbox"
                    checked={reportAutoBlock}
                    onChange={(e) => setReportAutoBlock(e.target.checked)}
                    className="accent-[#E73847]"
                  />
                  <span>Block @{reportModalUser.username} immediately</span>
                </label>

                <div className="pt-2 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setReportModalUser(null)}
                    className="px-4 py-2 rounded-full font-mono text-xs font-bold text-[#1D3557]/70 hover:bg-[#F0FAEF] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={reporting}
                    className="bg-[#E73847] hover:bg-[#d02736] text-white px-5 py-2 rounded-full font-mono text-xs font-bold uppercase tracking-wider transition shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {reporting ? "Submitting..." : "Submit Report"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Feed;
