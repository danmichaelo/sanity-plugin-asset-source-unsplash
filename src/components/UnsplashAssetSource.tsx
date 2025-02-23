import React from 'react'
import PhotoAlbum from 'react-photo-album'
import { flatten } from 'lodash'
import { BehaviorSubject, Subscription } from 'rxjs'
import { Asset, AssetDocument, SanityDocument, UnsplashPhoto } from '../types'
import Photo from './Photo'
import { fetchDownloadUrl, search } from '../datastores/unsplash'
import { Card, Dialog, Flex, Spinner, Stack, Text, TextInput } from '@sanity/ui'
import { Search } from './UnsplashAssetSource.styled'
import InfiniteScroll from 'react-infinite-scroll-component'

type Props = {
  onSelect: (assets: Asset[]) => void
  onClose: () => void
  selectedAssets?: AssetDocument[]
  selectionType: 'single' | 'multiple'
  document?: SanityDocument
}

type State = {
  query: string
  searchResults: UnsplashPhoto[][]
  page: number
  isLoading: boolean
  cursor: number
}

const RESULTS_PER_PAGE = 42
const PHOTO_SPACING = 2
const PHOTO_PADDING = 1 // offset the 1px border width

export default class UnsplashAssetSource extends React.Component<Props, State> {
  static defaultProps = {
    selectedAssets: undefined
  }

  state = {
    cursor: 0,
    query: '',
    page: 1,
    searchResults: [[]],
    isLoading: true
  }

  searchSubscription: Subscription | null = null

  searchSubject$ = new BehaviorSubject('')
  pageSubject$ = new BehaviorSubject(1)

  componentDidMount() {
    this.searchSubscription = search(
      this.searchSubject$,
      this.pageSubject$,
      RESULTS_PER_PAGE
    ).subscribe({
      next: (results: UnsplashPhoto[]) => {
        const searchResults = [...this.state.searchResults, results]
        this.setState({
          searchResults,
          isLoading: false
        })
      }
    })
  }

  componentWillUnmount() {
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe()
    }
  }

  handleSelect = (photo: UnsplashPhoto) => {
    this.setState({ isLoading: true })
    return fetchDownloadUrl(photo).then(downloadUrl => {
      const description = photo.description || undefined
      const asset: Asset = {
        kind: 'url',
        value: downloadUrl,
        assetDocumentProps: {
          source: {
            name: 'unsplash',
            id: photo.id,
            url: photo.links.html
          },
          description,
          creditLine: `${photo.user.name} by Unsplash`
        }
      }
      this.props.onSelect([asset])
    })
  }

  handleClose = () => {
    this.props.onClose()
  }

  handleSearchTermChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.currentTarget.value
    this.setState({ query, page: 1, searchResults: [[]], isLoading: true, cursor: 0 })
    this.pageSubject$.next(1)
    this.searchSubject$.next(query)
  }

  handleScollerLoadMore = () => {
    const nextPage = this.state.page + 1
    this.setState({ page: nextPage, isLoading: true })
    this.pageSubject$.next(nextPage)
    this.searchSubject$.next(this.state.query)
  }

  handleKeyDown = (event: any) => {
    const { cursor } = this.state
    if ((event.keyCode === 38 || event.keyCode === 37) && cursor > 0) {
      this.setState(prevState => ({
        cursor: prevState.cursor - 1
      }))
    } else if (
      (event.keyCode === 40 || event.keyCode === 39) &&
      cursor < this.getPhotos().length - 1
    ) {
      this.setState(prevState => ({
        cursor: prevState.cursor + 1
      }))
    }
  }

  getPhotos() {
    return flatten(this.state.searchResults)
  }

  updateCursor = (photo: UnsplashPhoto) => {
    const index = this.getPhotos().findIndex((result: UnsplashPhoto) => result.id === photo.id)
    this.setState({ cursor: index })
  }

  renderImage = (props: any) => {
    const { photo, layout } = props
    const active =
      this.getPhotos().findIndex((result: UnsplashPhoto) => result.id === photo.data.id) ===
      this.state.cursor || false
    return (
      <Photo
        onClick={this.handleSelect.bind(photo.data)}
        onKeyDown={this.handleKeyDown}
        data={photo.data}
        width={layout.width}
        height={layout.height}
        active={active}
        onFocus={this.updateCursor}
      />
    )
  }

  render() {
    const { query, searchResults, isLoading } = this.state

    return (
      <Dialog
        id='unsplash-asset-source'
        header='Select image from Unsplash'
        onClose={this.handleClose}
        open
        width={4}
      >
        <Stack space={3} padding={4}>
          <Card>
            <Search space={3}>
              <Text size={1} weight='semibold'>
                Search Unsplash
              </Text>
              <TextInput
                label='Search Unsplash.com'
                placeholder='Topics or colors'
                value={query}
                onChange={this.handleSearchTermChanged}
              />
            </Search>
          </Card>
          {!isLoading && this.getPhotos().length === 0 && (
            <Text size={1} muted>
              No results found
            </Text>
          )}
          <InfiniteScroll
            dataLength={this.getPhotos().length} // This is important field to render the next data
            next={this.handleScollerLoadMore}
            // scrollableTarget="unsplash-scroller"
            hasMore={true}
            scrollThreshold={0.99}
            height='60vh'
            loader={
              <Flex align='center' justify='center' padding={3}>
                <Spinner muted />
              </Flex>
            }
            endMessage={
              <Text size={1} muted>
                No more results
              </Text>
            }
          >
            {searchResults.filter((photos) => photos.length > 0).map((photos: UnsplashPhoto[], index) =>
              (
                <PhotoAlbum
                  key={`gallery-${query || 'popular'}-${index}`}
                  layout='rows'
                  spacing={PHOTO_SPACING}
                  padding={PHOTO_PADDING}
                  targetRowHeight={(width) => width < 300 ? 150 : width < 600 ? 200 : 300}
                  photos={photos.map((photo: UnsplashPhoto) => ({
                    src: photo.urls.small,
                    width: photo.width,
                    height: photo.height,
                    key: photo.id,
                    data: photo
                  }))}
                  renderPhoto={this.renderImage}
                  componentsProps={{ containerProps: { style: { marginBottom: `${PHOTO_SPACING}px` } } }}
                />
              ))}
          </InfiniteScroll>
        </Stack>
      </Dialog>
    )
  }
}
