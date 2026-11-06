import { Query } from "appwrite";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { account, databases } from "../appwrite/config";
import {
  getPublicReader,
  sendInterest,
  withdrawInterest,
  unmatchReader,
  blockReader,
  reportReader,
  getSocialPreferences,
} from "../utils/socialApi";

function PublicProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [reader, setReader] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSelf, setIsSelf] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentUserPref, setCurrentUserPref] = useState(null);

  // Match celebration modal state
  const [celebrationMatch, setCelebrationMatch] = useState(null);

  // Report modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("inappropriate_content");
  const [reportDetails, setReportDetails] = useState("");
  const [reportAutoBlock, setReportAutoBlock] = useState(true);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setLoading(true);
      setError("");

      try {
        const currentUser = await account.get();
        if (currentUser.$id === userId) {
          if (isMounted) setIsSelf(true);
        }

        try {
          const myPrefData = await getSocialPreferences();
          if (isMounted) setCurrentUserPref(myPrefData.preferences);
        } catch {
          // Keep null if unauthenticated
        }

        // Try getting public reader from backend social discovery
        try {
          const res = await getPublicReader(userId);
          if (isMounted && res.reader) {
            setReader(res.reader);
            setLoading(false);
            return;
          }
        } catch (backendErr) {
          if (backendErr.message.includes("404")) {
            if (isMounted) {
              setError("This reader profile doesn't exist or is not publicly accessible.");
              setLoading(false);
            }
            return;
          }
        }

        // Fallback: Check Appwrite profiles collection for legacy users
        const profileResult = await databases.listDocuments(
          import.meta.env.VITE_APPWRITE_DATABASE_ID,
          import.meta.env.VITE_APPWRITE_PROFILES_COLLECTION_ID,
          [Query.equal("userId", userId)]
        );

        if (profileResult.documents.length > 0) {
          const p = profileResult.documents[0];
          if (isMounted) {
            setReader({
              userId: p.userId,
              displayName: p.displayName || "Reader",
              username: p.username || "reader",
              bio: p.bio || "",
              intent: "friends",
              selectedFavorites: [],
              topGenres: [],
              compatibility: {
                score: null,
                label: "Legacy Profile",
                explanation: "Reader has not yet configured discovery preferences.",
              },
              isMatched: false,
              hasSentInterest: false,
            });
          }
        } else {
          if (isMounted) setError("Reader Not Found");
        }
      } catch (err) {
        console.error("PublicProfile load error:", err);
        if (isMounted) setError("Failed to load reader profile.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [userId]);

  async function handleSendInterest(intentType) {
    setActionLoading(true);
    try {
      const res = await sendInterest(userId, intentType);
      if (res.status === "matched") {
        setCelebrationMatch({
          displayName: reader.displayName,
          username: reader.username,
          type: res.match?.type || intentType,
        });
      }
      const refreshed = await getPublicReader(userId);
      setReader(refreshed.reader);
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleWithdraw() {
    setActionLoading(true);
    try {
      await withdrawInterest(userId);
      const refreshed = await getPublicReader(userId);
      setReader(refreshed.reader);
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUnmatch() {
    if (!window.confirm("Are you sure you want to unmatch?")) return;
    setActionLoading(true);
    try {
      await unmatchReader(userId);
      const refreshed = await getPublicReader(userId);
      setReader(refreshed.reader);
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBlock() {
    if (!window.confirm("Block this reader? You will no longer see each other.")) return;
    try {
      await blockReader(userId);
      alert("Reader blocked.");
      navigate("/feed");
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleSubmitReport(e) {
    e.preventDefault();
    setReporting(true);
    try {
      await reportReader(userId, reportReason, reportDetails, reportAutoBlock);
      alert("Report submitted to moderation. Thank you for keeping Libsque safe.");
      setShowReportModal(false);
      if (reportAutoBlock) {
        navigate("/feed");
      }
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
            Calculating reading compatibility...
          </span>
        </div>
      </div>
    );
  }

  if (error || !reader) {
    return (
      <div className="min-h-screen bg-[#F0FAEF] flex flex-col items-center justify-center p-8 text-center text-[#1D3557]">
        <div className="max-w-md bg-white border border-[#1D3557]/15 rounded-3xl p-8 sm:p-10 shadow-sm space-y-4">
          <h2 className="font-serif font-bold text-2xl sm:text-3xl text-[#1D3557]">
            Reader Unavailable
          </h2>
          <p className="text-sm text-[#1D3557]/70 font-sans leading-relaxed">
            {error || "This reader profile doesn't exist, is private, or has been blocked."}
          </p>
          <div className="pt-2">
            <Link
              to="/feed"
              className="bg-[#1D3557] text-[#F0FAEF] font-mono text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-full hover:bg-[#152740] transition shadow-xs inline-block"
            >
              Back to Discover Readers
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const comp = reader.compatibility || {};
  const canSendDating =
    Boolean(currentUserPref?.adultConfirmed) &&
    (reader.intent === "dating" || reader.intent === "both");

  return (
    <div className="min-h-screen bg-[#F0FAEF] text-[#1D3557] px-4 py-8 sm:px-8 md:px-12 lg:px-16">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Navigation Breadcrumb & Discreet Safety Controls */}
        <div className="flex items-center justify-between">
          <Link
            to="/feed"
            className="text-xs font-mono text-[#457B9D] hover:text-[#1D3557] flex items-center gap-1.5 font-bold transition"
          >
            ← Back to Readers
          </Link>

          {!isSelf && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowReportModal(true)}
                className="text-xs font-mono text-[#1D3557]/50 hover:text-[#E73847] px-2.5 py-1 rounded transition cursor-pointer"
                title="Report Reader"
              >
                🚩 Report
              </button>
              <button
                onClick={handleBlock}
                className="text-xs font-mono text-[#1D3557]/50 hover:text-[#1D3557] px-2.5 py-1 rounded transition cursor-pointer"
                title="Block Reader"
              >
                🚫 Block
              </button>
            </div>
          )}
        </div>

        {/* Profile Header Card */}
        <div className="bg-white border border-[#1D3557]/15 rounded-3xl p-6 sm:p-10 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-start gap-5">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#A8DADB]/25 border border-[#1D3557]/15 flex items-center justify-center shrink-0">
              <span className="font-serif font-black text-2xl sm:text-3xl text-[#1D3557]">
                {reader.displayName?.charAt(0) || "R"}
              </span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h1 className="text-3xl sm:text-4xl font-serif font-black text-[#1D3557]">
                  {reader.displayName}
                </h1>
                <span className="font-mono text-xs sm:text-sm text-[#457B9D]">
                  @{reader.username}
                </span>
              </div>
              <p className="text-sm text-[#1D3557]/80 font-sans max-w-xl leading-relaxed">
                {reader.bio || "Fellow reader exploring stories on Libsque."}
              </p>

              <div className="pt-2 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono px-3 py-1 rounded-full bg-[#F0FAEF] border border-[#1D3557]/10 text-[#1D3557]">
                  Looking for: <span className="capitalize font-bold text-[#457B9D]">{reader.intent || "Reading Friends"}</span>
                </span>
                {reader.isMatched && (
                  <span className="text-xs font-mono px-3 py-1 rounded-full bg-[#E73847] text-white font-bold shadow-xs">
                    Mutual Connection ❤️
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          {!isSelf && (
            <div className="self-stretch md:self-auto flex flex-col gap-2.5 shrink-0">
              {reader.isMatched ? (
                <button
                  onClick={handleUnmatch}
                  disabled={actionLoading}
                  className="bg-white border border-[#E73847]/40 text-[#E73847] hover:bg-[#E73847]/10 font-mono text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-full transition cursor-pointer"
                >
                  Unmatch Connection
                </button>
              ) : reader.hasSentInterest ? (
                <button
                  onClick={handleWithdraw}
                  disabled={actionLoading}
                  className="bg-[#A8DADB]/30 hover:bg-[#A8DADB]/50 text-[#1D3557] font-mono text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-full transition cursor-pointer"
                >
                  Interest Sent ✓ (Withdraw)
                </button>
              ) : (
                <div className="flex flex-col sm:flex-row md:flex-col gap-2">
                  <button
                    onClick={() => handleSendInterest("friends")}
                    disabled={actionLoading}
                    className="bg-[#1D3557] hover:bg-[#152740] text-white font-mono text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-full transition shadow-xs cursor-pointer text-center"
                  >
                    Connect as Reading Friends
                  </button>

                  {canSendDating && (
                    <button
                      onClick={() => handleSendInterest("dating")}
                      disabled={actionLoading}
                      className="bg-[#E73847] hover:bg-[#d02736] text-white font-mono text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-full transition shadow-xs cursor-pointer text-center"
                    >
                      Connect for Dating 💌
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* READING COMPATIBILITY CARD */}
        {!isSelf && (
          <div className="bg-[#1D3557] text-white rounded-3xl p-5 sm:p-7 shadow-md space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 border-b border-white/15 pb-3.5">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#A8DADB] font-bold block mb-0.5">
                  Reader Taste Comparison
                </span>
                <h2 className="text-2xl sm:text-3xl font-serif font-black text-white">
                  Reading Compatibility
                </h2>
              </div>

              {comp.score !== null ? (
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-2xl sm:text-3xl font-black text-[#E73847]">
                    {comp.score}%
                  </span>
                  <span className="font-mono text-xs text-white/80 uppercase tracking-wider">
                    Reading Compatibility
                  </span>
                </div>
              ) : (
                <span className="font-mono text-xs text-white/70">
                  {comp.label || "Reading Compatibility"}
                </span>
              )}
            </div>

            <p className="text-sm font-sans text-white/90 leading-relaxed">
              {comp.explanation || "Curate your favorite titles to discover shared resonance."}
            </p>

            {comp.sharedGenres?.length > 0 && (
              <div className="pt-1 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-white/70 uppercase font-bold tracking-wider">
                  Shared Genres:
                </span>
                {comp.sharedGenres.map((g) => (
                  <span
                    key={g}
                    className="bg-white/15 text-white px-3 py-1 rounded-full font-mono text-xs capitalize"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SHOWCASED FAVORITE BOOKS */}
        {reader.selectedFavorites?.length > 0 && (
          <section className="bg-white border border-[#1D3557]/15 rounded-3xl p-5 sm:p-7 shadow-xs space-y-4">
            <div>
              <span className="font-mono text-xs uppercase tracking-widest text-[#457B9D] font-bold block mb-0.5">
                Curated Shelf
              </span>
              <h3 className="text-2xl font-serif font-black text-[#1D3557]">
                Showcased Favorite Books
              </h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {reader.selectedFavorites.map((book) => (
                <Link
                  key={book.id || book.title}
                  to={book.id ? `/book/${book.id}` : "#"}
                  className="group flex flex-col"
                >
                  <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-[#F0FAEF] border border-[#1D3557]/15 mb-2.5 shadow-xs group-hover:-translate-y-1.5 transition duration-200">
                    {book.coverId ? (
                      <img
                        src={`https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`}
                        alt={book.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="p-3 text-center text-xs font-serif text-[#1D3557]/80 flex flex-col items-center justify-center h-full gap-1 bg-[#A8DADB]/20">
                        <span className="font-bold line-clamp-3">{book.title}</span>
                        <span className="text-[10px] font-mono text-[#457B9D] line-clamp-1">{book.author}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-serif font-bold text-[#1D3557] line-clamp-1 group-hover:text-[#E73847] transition">
                    {book.title}
                  </p>
                  <p className="text-[11px] text-[#457B9D] line-clamp-1">
                    {book.author}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* TOP GENRES */}
        {reader.topGenres?.length > 0 && (
          <section className="bg-white border border-[#1D3557]/15 rounded-3xl p-5 sm:p-7 shadow-xs space-y-3">
            <div>
              <span className="font-mono text-xs uppercase tracking-widest text-[#457B9D] font-bold block mb-0.5">
                Shelf Taste
              </span>
              <h3 className="text-2xl font-serif font-black text-[#1D3557]">
                Favorite Genres
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {reader.topGenres.map((genre) => (
                <span
                  key={genre}
                  className="bg-[#A8DADB]/20 border border-[#1D3557]/10 text-[#1D3557] px-3.5 py-1.5 rounded-full font-mono text-xs capitalize"
                >
                  {genre}
                </span>
              ))}
            </div>
          </section>
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
                You and <strong className="text-[#1D3557] font-serif">{celebrationMatch.displayName}</strong> both expressed interest in connecting for{" "}
                <span className="font-bold text-[#E73847]">{celebrationMatch.type}</span>.
              </p>

              <button
                type="button"
                onClick={() => setCelebrationMatch(null)}
                className="bg-[#E73847] hover:bg-[#d02736] text-white font-mono text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-full transition shadow-xs cursor-pointer mt-2"
              >
                Continue Exploring Shelf
              </button>
            </div>
          </div>
        )}

        {/* REPORT MODAL */}
        {showReportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white border border-[#1D3557]/20 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-xl space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#E73847] font-bold">
                    Community Safety
                  </span>
                  <h3 className="font-serif font-bold text-xl text-[#1D3557] mt-0.5">
                    Report @{reader.username}
                  </h3>
                </div>
                <button
                  onClick={() => setShowReportModal(false)}
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
                  <span>Block @{reader.username} immediately</span>
                </label>

                <div className="pt-2 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
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

export default PublicProfile;
