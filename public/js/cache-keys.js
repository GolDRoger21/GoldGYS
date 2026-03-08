export const USER_CACHE_KEYS = Object.freeze({
    userProfile: (uid) => `user_profile_${uid}`,
    topicProgressCollection: (uid) => `topic_progress_col_${uid}`,
    examResultsCollection: (uid) => `exam_results_col_${uid}`,
    dashboardStats: (uid) => `dashboard_stats_${uid}`,
    userFavorites: (uid) => `user_favorites_${uid}`
});
