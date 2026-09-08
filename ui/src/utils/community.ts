import { proxyCommunityGraphQL } from "@/services/community-proxy";

export interface CommunityPost {
  id: string;
  user_id: string;
  body: { text: string; media: { type: string; url: string }[] };
  parent_id: string | null;
  reshare_id: string | null;
  hidden: boolean;
  created_at: string;
  like_count: number;
  liked_by_me: boolean;
  reply_count: number;
  reshare_count: number;
  author_name: string;
}

export interface CommunityNotification {
  id: string;
  actor_id: string;
  post_id: string;
  type: string;
  read: boolean;
  created_at: string;
}

async function gql<T = any>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const result = await proxyCommunityGraphQL({ data: { query, variables } });
  if (result.errors) {
    throw new Error(result.errors[0]?.message ?? "Community API error");
  }
  return result.data as T;
}

export const community = {
  // Queries
  feed(cursor?: string, limit = 20) {
    return gql<{ feed: CommunityPost[] }>(
      "query feed($cursor: String, $limit: Int)",
      { cursor: cursor ?? "", limit },
    );
  },

  post(id: string) {
    return gql<{ post: CommunityPost; replies: CommunityPost[] }>(
      "query post($id: String)",
      { id },
    );
  },

  myPosts(limit = 20) {
    return gql<{ myPosts: CommunityPost[] }>(
      "query myPosts($limit: Int)",
      { limit },
    );
  },

  search(query: string, limit = 20) {
    return gql<{ search: CommunityPost[] }>(
      "query search($query: String, $limit: Int)",
      { query, limit },
    );
  },

  notifications(limit = 20) {
    return gql<{ notifications: CommunityNotification[] }>(
      "query notifications($limit: Int)",
      { limit },
    );
  },

  unreadNotificationCount() {
    return gql<{ unreadNotificationCount: number }>(
      "query unreadNotificationCount",
    );
  },

  // Mutations
  createPost(text: string, media?: { type: string; url: string }[]) {
    return gql<{ createPost: CommunityPost }>(
      "mutation createPost($text: String, $media: JSON)",
      { text, media: media ?? [] },
    );
  },

  deletePost(id: string) {
    return gql<{ deletePost: boolean }>("mutation deletePost($id: String)", {
      id,
    });
  },

  toggleLike(postId: string) {
    return gql<{ toggleLike: { liked: boolean; count: number } }>(
      "mutation toggleLike($postId: String)",
      { postId },
    );
  },

  replyToPost(
    postId: string,
    text: string,
    media?: { type: string; url: string }[],
  ) {
    return gql<{ replyToPost: CommunityPost }>(
      "mutation replyToPost($postId: String, $text: String, $media: JSON)",
      { postId, text, media: media ?? [] },
    );
  },

  resharePost(postId: string) {
    return gql<{ resharePost: CommunityPost }>(
      "mutation resharePost($postId: String)",
      { postId },
    );
  },

  requestUploadUrl(filename: string, contentType: string) {
    return gql<{ requestUploadUrl: { uploadUrl: string; publicUrl: string } }>(
      "mutation requestUploadUrl($filename: String, $contentType: String)",
      { filename, contentType },
    );
  },

  markNotificationsRead() {
    return gql<{ markNotificationsRead: boolean }>(
      "mutation markNotificationsRead",
    );
  },

  markAllNotificationsRead() {
    return gql<{ markAllNotificationsRead: boolean }>(
      "mutation markAllNotificationsRead",
    );
  },

  reportPost(postId: string, reason: string) {
    return gql<{ reportPost: boolean }>(
      "mutation reportPost($postId: String, $reason: String)",
      { postId, reason },
    );
  },

  blockUser(userId: string) {
    return gql<{ blockUser: boolean }>("mutation blockUser($userId: String)", {
      userId,
    });
  },

  unblockUser(userId: string) {
    return gql<{ unblockUser: boolean }>(
      "mutation unblockUser($userId: String)",
      { userId },
    );
  },
};

/**
 * Upload a file to R2 via presigned URL and return the public URL.
 */
export async function uploadToR2(
  file: File,
): Promise<string> {
  const { requestUploadUrl } = await community.requestUploadUrl(
    file.name,
    file.type,
  );

  const res = await fetch(requestUploadUrl.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!res.ok) throw new Error("Upload failed");
  return requestUploadUrl.publicUrl;
}
