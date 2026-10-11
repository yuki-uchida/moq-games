import { encodeMoqJson } from '../../../../../utils/moqJson'
import { MoqtClientWrapper, RequestErrorCode } from '../../../../../lib/moqt/moqtClient'
import { OBJECT_STATUS_END_OF_GROUP } from '../../../../../utils/media/objectStatus'

interface ActionSubscription {
  requestId: bigint
  trackAlias: bigint
}

export class MoqChannel {
  private session = new MoqtClientWrapper()
  private aliases = new Map<bigint, bigint>()
  private group = BigInt(Date.now()) * 1000n
  private receiving = false
  private connected = false
  private followingAvailable = false
  private subscriptionCleanupFailed = false
  private receiveGeneration = 0
  private subscription?: ActionSubscription

  constructor(
    private namespace: string[],
    private publishTrack: string,
    private subscribeTrack: string,
    private receive: (value: unknown) => void,
    private status: (text: string) => void,
    private onClosed: () => void = () => {}
  ) {}

  async connect(url: string): Promise<void> {
    const session = this.session
    const publishing = [...this.namespace, this.publishTrack]
    const following = [...this.namespace, this.subscribeTrack]
    try {
      await session.connect(url)
      this.connected = true
      session.setOnConnectionClosedHandler(() => {
        this.connected = false
        this.followingAvailable = false
        this.receiveGeneration++
        if (this.subscription) session.clearSubgroupObjectHandler(this.subscription.trackAlias)
        this.subscription = undefined
        this.aliases.clear()
        this.onClosed()
        this.status('MoQ 切断 · 再接続にはページをリロードしてください')
      })
      session.setOnIncomingSubscribeHandler(async ({ subscribe, isSuccess, code, respondOk, respondError }) => {
        if (!isSuccess) {
          await respondError(BigInt(code), 'Subscription rejected')
        } else if (
          subscribe.trackName !== this.publishTrack ||
          subscribe.trackNamespace.join('/') !== publishing.join('/')
        ) {
          await respondError(RequestErrorCode.TrackDoesNotExist, 'Unknown track')
        } else {
          this.aliases.set(subscribe.requestId, await respondOk())
          this.status('MoQ 配信中')
        }
      })
      session.setOnIncomingUnsubscribeHandler((id) => this.aliases.delete(id))
      session.setOnPublishNamespaceDoneHandler(({ trackNamespace }) => {
        if (trackNamespace.join('/') !== following.join('/')) return
        this.followingAvailable = false
        this.receiveGeneration++
        void this.stopFollowing(following)
      })
      session.setOnPublishNamespaceHandler(async ({ publishNamespace, respondOk }) => {
        const generation = this.receiveGeneration
        await respondOk()
        if (
          !this.connected ||
          generation !== this.receiveGeneration ||
          publishNamespace.trackNamespace.join('/') !== following.join('/')
        )
          return
        this.followingAvailable = true
        await this.follow(following)
      })
      await session.publishNamespace(publishing, '')
      await session.subscribeNamespace(following, '')
      this.status('MoQ 接続済み')
    } catch (error) {
      await session.disconnect()
      throw error
    }
  }

  private async releaseSubscription(subscription: ActionSubscription): Promise<void> {
    this.session.clearSubgroupObjectHandler(subscription.trackAlias)
    if (!this.connected) return
    try {
      await this.session.unsubscribe(subscription.requestId)
    } catch (error) {
      this.subscriptionCleanupFailed = true
      if (this.connected) this.status(`購読解除エラー: ${String(error)} · ページをリロードしてください`)
    }
  }

  private async stopFollowing(following: string[]): Promise<void> {
    const subscription = this.subscription
    if (!subscription) return
    this.subscription = undefined
    this.receiving = true
    try {
      await this.releaseSubscription(subscription)
    } finally {
      this.receiving = false
      if (this.followingAvailable) void this.follow(following)
    }
  }

  private async follow(following: string[]): Promise<void> {
    if (
      !this.connected ||
      !this.followingAvailable ||
      this.receiving ||
      this.subscription ||
      this.subscriptionCleanupFailed
    )
      return
    this.receiving = true
    const generation = this.receiveGeneration
    try {
      const { requestId, subscribeOk } = await this.session.subscribe(following, this.subscribeTrack, '', {
        filterType: 2,
        forward: true
      })
      const subscription = { requestId, trackAlias: subscribeOk.trackAlias }
      if (!this.connected || !this.followingAvailable || generation !== this.receiveGeneration) {
        await this.releaseSubscription(subscription)
        return
      }
      this.subscription = subscription
      this.session.setOnSubgroupObjectHandler(subscription.trackAlias, (_group, object) => {
        if (
          !this.connected ||
          this.subscription !== subscription ||
          generation !== this.receiveGeneration ||
          object.objectStatus !== undefined ||
          !object.objectPayload.length
        )
          return
        try {
          this.receive(JSON.parse(new TextDecoder().decode(new Uint8Array(object.objectPayload))))
        } catch (error) {
          this.status(`受信エラー: ${String(error)}`)
        }
      })
      this.status('MoQ 購読中')
    } catch (error) {
      if (this.connected && generation === this.receiveGeneration) this.status(`購読エラー: ${String(error)}`)
    } finally {
      this.receiving = false
      if (generation !== this.receiveGeneration && this.followingAvailable) void this.follow(following)
    }
  }

  async send(value: unknown): Promise<boolean> {
    const client = this.session.getRawClient()
    if (!client || !this.aliases.size) return false
    const payload = encodeMoqJson(value)
    const group = this.group++
    for (const alias of new Set(this.aliases.values())) {
      await client.sendSubgroupHeader(alias, group, 0n, 0)
      await client.sendSubgroupObject(alias, group, 0n, 0n, undefined, payload, undefined)
      await client.sendSubgroupObject(alias, group, 0n, 1n, OBJECT_STATUS_END_OF_GROUP, new Uint8Array(0), undefined)
    }
    return true
  }
}
