import React, { useContext, useMemo } from 'react';
import DescriptionList from 'Components/DescriptionList/DescriptionList';
import DescriptionListItem from 'Components/DescriptionList/DescriptionListItem';
import Icon from 'Components/Icon';
import Label from 'Components/Label';
import Popover from 'Components/Tooltip/Popover';
import Episode from 'Episode/Episode';
import EpisodeFormats from 'Episode/EpisodeFormats';
import EpisodeQuality from 'Episode/EpisodeQuality';
import MediaInfo from 'Episode/Summary/MediaInfo';
import { EpisodeFile } from 'EpisodeFile/EpisodeFile';
import { EpisodeFileContext } from 'EpisodeFile/EpisodeFileProvider';
import { icons, kinds, tooltipPositions } from 'Helpers/Props';
import { QualityModel } from 'Quality/Quality';
import formatBytes from 'Utilities/Number/formatBytes';
import formatCustomFormatScore from 'Utilities/Number/formatCustomFormatScore';
import padNumber from 'Utilities/Number/padNumber';
import translate from 'Utilities/String/translate';
import styles from './ExistingQualityCellContent.module.css';

interface ExistingFileDetailsProps {
  episodeFile: EpisodeFile;
}

function ExistingFileDetails({ episodeFile }: ExistingFileDetailsProps) {
  const {
    relativePath,
    path,
    size,
    quality,
    qualityCutoffNotMet,
    languages,
    releaseGroup,
    customFormats,
    customFormatScore,
    mediaInfo,
  } = episodeFile;

  const languageNames = languages?.map(({ name }) => name).join(', ');

  return (
    <div className={styles.fileDetails}>
      <DescriptionList>
        {relativePath || path ? (
          <DescriptionListItem
            title={translate('RelativePath')}
            data={
              <span className={styles.filePath}>{relativePath || path}</span>
            }
          />
        ) : null}

        <DescriptionListItem
          title={translate('Size')}
          data={formatBytes(size)}
        />

        <DescriptionListItem
          title={translate('Quality')}
          data={
            <EpisodeQuality
              quality={quality}
              isCutoffNotMet={qualityCutoffNotMet}
              showRevision={true}
            />
          }
        />

        {languageNames ? (
          <DescriptionListItem
            title={translate('Languages')}
            data={languageNames}
          />
        ) : null}

        {releaseGroup ? (
          <DescriptionListItem
            title={translate('ReleaseGroup')}
            data={releaseGroup}
          />
        ) : null}

        {customFormats?.length ? (
          <DescriptionListItem
            title={translate('CustomFormats')}
            data={
              <div className={styles.customFormats}>
                <span>
                  {formatCustomFormatScore(
                    customFormatScore,
                    customFormats.length
                  )}
                </span>
                <EpisodeFormats formats={customFormats} />
              </div>
            }
          />
        ) : null}
      </DescriptionList>

      {mediaInfo ? (
        <div className={styles.mediaInfoSection}>
          <MediaInfo {...mediaInfo} />
        </div>
      ) : null}
    </div>
  );
}

interface ExistingQualityCellContentProps {
  episodes: Episode[];
  queuedQuality?: QualityModel;
}

export default function ExistingQualityCellContent({
  episodes,
  queuedQuality,
}: ExistingQualityCellContentProps) {
  const episodeFiles = useContext(EpisodeFileContext);

  const episodeFileMap = useMemo(() => {
    const map = new Map<number, NonNullable<typeof episodeFiles>[number]>();

    if (episodeFiles) {
      episodeFiles.forEach((file) => {
        map.set(file.id, file);
      });
    }

    return map;
  }, [episodeFiles]);

  if (episodes.length === 0) {
    return <span>-</span>;
  }

  if (episodes.length === 1) {
    const episode = episodes[0];

    if (!episode.hasFile || !episode.episodeFileId) {
      return (
        <div className={styles.container}>
          <Label kind={kinds.WARNING}>{translate('Missing')}</Label>
        </div>
      );
    }

    const episodeFile = episodeFileMap.get(episode.episodeFileId);

    if (!episodeFile) {
      return (
        <div className={styles.container}>
          <Label kind={kinds.DEFAULT}>{translate('Downloaded')}</Label>
        </div>
      );
    }

    return (
      <Popover
        anchor={
          <span className={styles.popoverAnchor}>
            <EpisodeQuality
              quality={episodeFile.quality}
              size={episodeFile.size}
              isCutoffNotMet={episodeFile.qualityCutoffNotMet}
              showRevision={true}
            />
            {episodeFile.size > 0 ? (
              <span className={styles.fileMeta}>
                {formatBytes(episodeFile.size)}
              </span>
            ) : null}
            <Icon
              className={styles.mediaInfoIcon}
              name={icons.MEDIA_INFO}
              size={12}
            />
          </span>
        }
        title={translate('MediaInfo')}
        body={<ExistingFileDetails episodeFile={episodeFile} />}
        position={tooltipPositions.LEFT}
      />
    );
  }

  const withFileEpisodes = episodes.filter(
    (e) => e.hasFile && e.episodeFileId > 0
  );
  const withFileCount = withFileEpisodes.length;
  const missingCount = episodes.length - withFileCount;

  const uniqueQualities = Array.from(
    new Map(
      withFileEpisodes
        .map((e) => episodeFileMap.get(e.episodeFileId)?.quality)
        .filter((q): q is QualityModel => !!q)
        .map((q) => [q.quality.id, q])
    ).values()
  );

  return (
    <Popover
      anchor={
        <span className={styles.popoverAnchor}>
          {missingCount > 0 ? (
            <Label kind={kinds.WARNING}>
              {withFileCount === 0
                ? `${translate('Missing')} (${missingCount})`
                : `${missingCount} ${translate('Missing')}`}
            </Label>
          ) : null}

          {withFileCount > 0 && uniqueQualities.length === 1 ? (
            <EpisodeQuality
              quality={uniqueQualities[0]}
              showRevision={false}
            />
          ) : null}

          {withFileCount > 0 ? (
            <Label kind={kinds.DEFAULT}>
              {`${withFileCount}/${episodes.length} ${translate('Downloaded')}`}
            </Label>
          ) : null}

          {withFileCount > 0 ? (
            <Icon
              className={styles.mediaInfoIcon}
              name={icons.MEDIA_INFO}
              size={12}
            />
          ) : null}
        </span>
      }
      title={translate('MediaInfo')}
      body={
        <div className={styles.popoverBody}>
          {queuedQuality ? (
            <div className={styles.popoverHeader}>
              <span>{translate('Quality')}:</span>
              <EpisodeQuality quality={queuedQuality} showRevision={true} />
            </div>
          ) : null}

          {episodes.map((episode) => {
            const file = episode.episodeFileId
              ? episodeFileMap.get(episode.episodeFileId)
              : undefined;

            return (
              <div key={episode.id} className={styles.episodeBlock}>
                <div className={styles.episodeRow}>
                  <div className={styles.episodeInfo}>
                    <span className={styles.episodeNumber}>
                      {`${episode.seasonNumber}x${padNumber(
                        episode.episodeNumber,
                        2
                      )}`}
                    </span>
                    <span
                      className={styles.episodeTitle}
                      title={episode.title}
                    >
                      {episode.title}
                    </span>
                  </div>

                  <div className={styles.episodeStatus}>
                    {!episode.hasFile ? (
                      <Label kind={kinds.WARNING}>{translate('Missing')}</Label>
                    ) : file ? (
                      <>
                        <EpisodeQuality
                          quality={file.quality}
                          size={file.size}
                          isCutoffNotMet={file.qualityCutoffNotMet}
                          showRevision={true}
                        />
                        {file.size > 0 ? (
                          <span className={styles.fileMeta}>
                            {formatBytes(file.size)}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <Label kind={kinds.DEFAULT}>
                        {translate('Downloaded')}
                      </Label>
                    )}
                  </div>
                </div>

                {file ? <ExistingFileDetails episodeFile={file} /> : null}
              </div>
            );
          })}
        </div>
      }
      position={tooltipPositions.LEFT}
    />
  );
}
